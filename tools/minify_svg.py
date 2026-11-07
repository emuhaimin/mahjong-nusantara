"""minify_svg.py — mengecilkan SVG dari Inkscape (hapus metadata, bulatkan angka).
Pakai: python3 -I tools/minify_svg.py <folder-sumber> <folder-tujuan>"""
import re, sys, os
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
DROP_NS = ('http://www.inkscape.org/namespaces/inkscape', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
           'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'http://creativecommons.org/ns#',
           'http://purl.org/dc/elements/1.1/', 'http://www.openswatchbook.org/uri/2009/osb')
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)
NUM = re.compile(r'-?\d*\.\d+(?:e-?\d+)?|-?\d+(?:e-?\d+)?')

def rnd(m):
    v = float(m.group(0))
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def ns(tag):
    return tag[1:].split('}')[0] if tag.startswith('{') else ''

def clean(el):
    for child in list(el):
        if ns(child.tag) in DROP_NS or child.tag in ('{%s}metadata' % SVG, '{%s}title' % SVG):
            el.remove(child)
        else:
            clean(child)
    for a in list(el.attrib):
        if ns(a) in DROP_NS:
            del el.attrib[a]
    for a in ('d', 'transform', 'points', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
              'x1', 'y1', 'x2', 'y2', 'offset', 'stroke-width'):
        if a in el.attrib:
            el.attrib[a] = NUM.sub(rnd, el.attrib[a])
    st = el.attrib.get('style')
    if st:
        parts = [p.strip() for p in st.split(';') if p.strip() and not p.strip().startswith('-inkscape')]
        parts = [p for p in parts if p.split(':')[0] not in ('font-variation-settings',)]
        el.attrib['style'] = ';'.join(NUM.sub(rnd, p) if 'width' in p else p for p in parts)

def run(src, dst):
    os.makedirs(dst, exist_ok=True)
    tot_in = tot_out = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith('.svg'):
            continue
        raw = open(os.path.join(src, f), 'rb').read()
        root = ET.fromstring(raw)
        clean(root)
        root.attrib.pop('version', None)
        out = ET.tostring(root, encoding='unicode')
        out = re.sub(r'>\s+<', '><', out)
        open(os.path.join(dst, f), 'w').write(out)
        tot_in += len(raw); tot_out += len(out.encode())
    print(f'{tot_in//1024} KB → {tot_out//1024} KB')

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
