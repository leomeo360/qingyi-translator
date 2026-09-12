from pathlib import Path
import zipfile
import json

root = Path(__file__).resolve().parent.parent
output = root / 'dist'
output.mkdir(exist_ok=True)
name = 'qingyi-deepseek-v' + json.loads((root / 'extension/manifest.json').read_text())['version'] + '.zip'
with zipfile.ZipFile(output / name, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((root / 'extension').rglob('*')):
        if file.is_file() and not file.name.startswith('.'):
            archive.write(file, file.relative_to(root / 'extension'))
    for document in ['README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md']:
        archive.write(root / document, document)
    for document in (root / 'docs').glob('*.md'):
        archive.write(document, document.relative_to(root))
    archive.write(root / 'reports/api-pages.json', 'reports/api-pages.json')
    for document in (root / 'reports').glob('benchmark-100-*.json'):
        if document.name != 'benchmark-100-inputs.json':
            archive.write(document, document.relative_to(root))
    archive.write(root / 'TEST_REPORT.md', 'TEST_REPORT.md')
    for report in ['reports/V2.6_PERFORMANCE.md', 'reports/api-latency-diagnosis.json', 'reports/V2.7_COMPARISON.md', 'reports/api-protected-sentences.json', 'reports/V2.8_PREFETCH.md']:
        archive.write(root / report, report)
print('已生成 dist/' + name)
