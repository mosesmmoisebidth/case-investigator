"""TruFor on CPU, run inside VeriSec's TruFor environment (.venv-trufor).

Same model and preprocessing as VeriSec's GPU forensics server
(TruFor/trufor_server.py): aspect-preserving thumbnail to MAXSIDE, /256,
anomaly map = softmax(pred)[1], integrity score = sigmoid(det). FP32 on CPU.

Usage (cwd = TruFor/test_docker/src):
  python trufor_runner.py OUT_DIR IMG1 [IMG2 ...]
Writes OUT_DIR/<stem>.npy (anomaly map), <stem>_conf.npy and <stem>.json.
"""

import json
import os
import sys
import time

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, os.path.abspath("."))
from config import _C as config  # noqa: E402
from config import update_config  # noqa: E402

MAXSIDE = int(os.environ.get("TRUFOR_MAXSIDE", "1024"))
torch.set_num_threads(max(1, os.cpu_count() or 1))


class A:
    opts = ["TEST.MODEL_FILE", "../weights/weights/trufor.pth.tar"]


update_config(config, A)
ck = torch.load(config.TEST.MODEL_FILE, map_location="cpu", weights_only=False)
from models.cmx.builder_np_conf import myEncoderDecoder as confcmx  # noqa: E402

model = confcmx(cfg=config).eval()
model.load_state_dict(ck["state_dict"])

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
for path in sys.argv[2:]:
    im = Image.open(path).convert("RGB")
    W0, H0 = im.size
    im.thumbnail((MAXSIDE, MAXSIDE), Image.BILINEAR)
    arr = np.array(im)
    rgb = torch.from_numpy(arr.transpose(2, 0, 1))[None].float() / 256.0
    t0 = time.time()
    with torch.inference_mode():
        pred, conf, det, npp = model(rgb)
    score = torch.sigmoid(det.float()).item()
    amap = torch.softmax(pred.float().squeeze(0), 0)[1].numpy()
    cmap = torch.sigmoid(conf.float()).squeeze().numpy()
    stem = os.path.splitext(os.path.basename(path))[0]
    np.save(os.path.join(out_dir, stem + ".npy"), amap.astype(np.float16))
    np.save(os.path.join(out_dir, stem + "_conf.npy"), cmap.astype(np.float16))
    with open(os.path.join(out_dir, stem + ".json"), "w") as f:
        json.dump({"score": round(score, 4), "map_w": int(amap.shape[1]), "map_h": int(amap.shape[0]), "orig_w": W0, "orig_h": H0, "ms": round((time.time() - t0) * 1000, 1)}, f)
    print(stem, round(score, 4), flush=True)
