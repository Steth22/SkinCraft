"""Copies the web app (wwwroot/) into docs/app/ so GitHub Pages serves it at /app/. Run after changing wwwroot."""
import os, shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = os.path.join(ROOT, 'wwwroot')
dst = os.path.join(ROOT, 'docs', 'app')
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst)
print('synced', sum(len(f) for _, _, f in os.walk(dst)), 'files to docs/app')
