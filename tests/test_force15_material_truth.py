import ast
from pathlib import Path


def test_continuation_never_claims_missing_images_or_invents_their_origin():
    source=Path(__file__).resolve().parents[1]/'force15_worker.py'
    fn=next(n for n in ast.parse(source.read_text(encoding='utf-8')).body
            if isinstance(n,ast.FunctionDef) and n.name=='followup_text')
    env={};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(source),'exec'),env)
    followup=env['followup_text']
    plain=followup('湖面清晨','16:9')
    assert '图片' not in plain and '参考素材' not in plain and '音频' not in plain
    assert '15秒' in plain and '湖面清晨' in plain and plain.startswith('确认')
    image=followup('湖面清晨','16:9',has_images=True)
    assert '已上传参考图片' in image and '豆包' not in image and '虚构数字人物' not in image
    audio=followup('湖面清晨','16:9',True)
    assert '参考音频' in audio and '图片' not in audio
