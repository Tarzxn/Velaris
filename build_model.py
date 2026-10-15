"""Rebuild or edit a saved model without calling any AI provider."""
import argparse
import json
from pathlib import Path

import artifacts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,help='A .model.json program')
    parser.add_argument('--output',type=Path,default=Path('generated/model.stl'))
    args = parser.parse_args()
    if args.output.suffix.lower() not in ('.stl','.glb'):
        parser.error('--output must end in .stl or .glb')
    spec = json.loads(args.source.read_text(encoding='utf-8'))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    result = artifacts.produce_artifact(args.output.parent,{'path':args.output.name,'kind':args.output.suffix[1:].lower(),'content':spec})
    print('Created:',args.output.parent/result['path'])
    for note in result['warnings']:
        print(note)


if __name__ == '__main__': main()
