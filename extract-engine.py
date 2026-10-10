# Regenerates sim/engine.js from the website's index.html so the server runs the exact same simulation.
# usage: python3 extract-engine.py path/to/index.html
import sys
src = open(sys.argv[1]).read()
a = src.index('const WS = 1.3'); b = src.index('/* ---------- effects ---------- */')
region = src[a:b]
eng = open('engine.js').read()
pre = eng[:eng.index('/* ===== BEGIN extracted from the site ===== */')]
post = eng[eng.index('/* ===== END extracted ===== */'):]
open('engine.js', 'w').write(pre + '/* ===== BEGIN extracted from the site ===== */\n' + region + '\n' + post)
print('engine regenerated')
