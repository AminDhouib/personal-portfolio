# Vendored from DevinoSolutions/.github, path actions/security-audit/conftest.py, commit 27fb535cbd0228d069c0d36e6b888a8bcc85e726.
# Vendored because this repo is owned by a personal account and cannot call the private org action.
# Unmodified. To resync, diff against a newer commit of the source path (see DESIGN.md).
"""Put `security_audit.py` on the path so `python -m pytest actions/security-audit -q` works from the repo root."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
