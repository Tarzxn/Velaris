import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

HAS_FLASK = importlib.util.find_spec('flask') is not None
if HAS_FLASK:
    import app as server


@unittest.skipUnless(HAS_FLASK,'Flask is not installed in this local test environment')
class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.patches = [patch.object(server,'WORKSPACES',self.root/'workspaces'),
                        patch.object(server.uploads,'ROOT',self.root/'uploads'),
                        patch.object(server,'RATE_LIMIT',0), patch.object(server,'OLLAMA_API_KEY','test'),
                        patch.object(server,'get_models',return_value=[{'id':'gpt-oss:120b'},{'id':'gemma4:31b'}]),
                        patch.object(server,'VISION_CRITIC',False)]
        for p in self.patches: p.start()
        server.WORKSPACES.mkdir()
        self.client = server.app.test_client()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.temp.cleanup()

    def test_page_and_attachment_picker(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code,200)
        self.assertIn(b'id="photoInput"',response.data)

    def test_upload_and_preview_roundtrip(self):
        buf = io.BytesIO(); Image.new('RGB',(80,40),'red').save(buf,'PNG'); buf.seek(0)
        response = self.client.post('/api/uploads',data={'images':(buf,'photo.png')},content_type='multipart/form-data')
        self.assertEqual(response.status_code,200)
        ident = response.json['images'][0]['id']
        preview = self.client.get('/api/uploads/'+ident)
        self.assertEqual(preview.mimetype,'image/jpeg')
        preview.close()

    def test_upload_rejects_non_image(self):
        response = self.client.post('/api/uploads',data={'images':(io.BytesIO(b'<html>bad</html>'),'image.png')},content_type='multipart/form-data')
        self.assertEqual(response.status_code,400)

    def test_invalid_attachment_is_rejected_before_upstream(self):
        with patch.object(server,'open_upstream') as opened:
            response = self.client.post('/api/chat',json={'prompt':'read this','images':[{'id':'../secret'}]})
            self.assertEqual(response.status_code,400); opened.assert_not_called()

    def test_full_chat_produces_both_model_exports(self):
        body = {'reply':'Here is the part.','files':[{'path':'part.stl','kind':'stl','content':{'tree':{'shape':'loft','sections':[[0,0,0,5,5],[0,0,12,4,4]]}}}]}
        class Response:
            status_code = 200
            def iter_lines(self,**kwargs):
                yield json.dumps({'message':{'content':json.dumps(body)},'done':True})
            def close(self): pass
        import cad_engine
        with patch.object(server,'open_upstream',return_value=(Response(),None)), patch.object(cad_engine,'_render_view',return_value=Image.new('RGB',(60,60))):
            response = self.client.post('/api/chat',json={'prompt':'Make a 3D model of a tapered knob'})
            events = [json.loads(line) for line in response.data.splitlines()]
        done = events[-1]
        self.assertEqual(done['type'],'done')
        self.assertEqual({f['path'] for f in done['files']},{'part.stl','part.glb','part.model.json','part-preview.png','part-validation.json'})
        ws = done['workspace']
        self.assertIn('loft',server.previous_model_sources([ws]))
        self.assertEqual(self.client.get(f'/api/inspect/{ws}/part.glb').json['kind'],'stl')
        download = self.client.get(f'/api/download/{ws}/part.glb')
        self.assertEqual(download.data[:4],b'glTF'); download.close()

    def test_upstream_failure_is_a_stream_error(self):
        with patch.object(server,'connect_generation',side_effect=ValueError('No quota')):
            response = self.client.post('/api/chat',json={'prompt':'Hello'})
            events = [json.loads(line) for line in response.data.splitlines()]
        self.assertEqual(events[-1]['type'],'error')
        self.assertIn('No quota',events[-1]['error'])


if __name__ == '__main__': unittest.main()
