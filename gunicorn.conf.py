# Gunicorn auto-loads this file from the working directory, so these settings
# apply even on hosts that just run `gunicorn app:app` without extra flags.
#
# timeout: Ollama Cloud generations (especially file-heavy STL/document
# requests, a web-search pass first, or High/Max reasoning effort on the
# largest model) can take well over gunicorn's 30s default, which otherwise
# kills the worker mid-request and makes the platform's proxy return an HTML
# error page instead of Velaris's own JSON error response. Kept above app.py's
# own request timeout (up to 380s at High/Max power) so gunicorn never wins
# that race.
#
# Keep the original single-worker deployment shape for the in-memory workspace lifecycle.

workers = 1
worker_class = "gthread"
threads = 8
timeout = 420
