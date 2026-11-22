#!/usr/bin/env python3
"""TimeWise smoke tests — static checks plus headless Chrome page rendering.

Run: python3 tests/smoke.py
Set CHROME_BIN if Chrome is not on PATH.
"""
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "index.html": ["Make every hour", "Get started free", "manifest.webmanifest"],
    "register.html": ["Create your account", "password-strength", "manifest.webmanifest"],
    "login.html": ["Welcome back", "forgot-password", "manifest.webmanifest"],
    "dashboard.html": ["Good ", "id=\"task-list\"", "id=\"timer-task\"", "id=\"focus-chart\"", "manifest.webmanifest"],
    "tasks.html": ["Your tasks", "filter-tabs", "id=\"task-reminder\"", "id=\"subtask-editor\"", "manifest.webmanifest"],
    "calendar.html": ["calendar-grid", "day-task-list", "manifest.webmanifest"],
    "insights.html": ["insights-grid", "donut-value", "id=\"focus-task-list\"", "manifest.webmanifest"],
    "settings.html": ["profile-form", "week-start", "name=\"theme\"", "manifest.webmanifest"],
    "pricing.html": ["Simple, honest pricing", "id=\"upgrade-btn\"", "id=\"free-cta\"", "manifest.webmanifest"],
}
EXPECTED_TASKS = {"dashboard.html": 4, "tasks.html": 5}
# Ignore external font/CDN resource warnings; only flag real JavaScript errors.
ERROR_PATTERN = re.compile(r"Uncaught|TypeError|ReferenceError|SyntaxError", re.I)


class ReferenceParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ("href", "src"):
            value = values.get(key)
            if value and not re.match(r"^(https?:|mailto:|#|data:)", value):
                self.refs.append(value)


def check(condition, message, failures):
    if not condition:
        failures.append(message)


def run_command(command):
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True)


def main():
    failures = []
    node = shutil.which("node")
    chrome = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium")

    if not node:
        failures.append("node is required for JavaScript syntax checks")
    else:
        for js in sorted((ROOT / "assets" / "js").glob("*.js")) + sorted((ROOT / "tests").glob("*.js")):
            result = run_command([node, "--check", str(js.relative_to(ROOT))])
            check(result.returncode == 0, f"JS syntax failed: {js.name} — {result.stderr.strip()}", failures)

    for page in sorted(ROOT.glob("*.html")):
        parser = ReferenceParser()
        parser.feed(page.read_text())
        for ref in parser.refs:
            target = (page.parent / ref.split("#")[0]).resolve()
            check(target.exists(), f"Missing local reference: {page.name} -> {ref}", failures)

    manifest_path = ROOT / "manifest.webmanifest"
    try:
        manifest = json.loads(manifest_path.read_text())
        check(manifest.get("display") == "standalone", "Manifest must use standalone display", failures)
        for icon in manifest.get("icons", []):
            icon_path = (ROOT / icon["src"]).resolve()
            check(icon_path.exists(), f"Missing PWA icon: {icon['src']}", failures)
    except Exception as error:
        failures.append(f"Invalid manifest.webmanifest: {error}")

    if chrome:
        for page, markers in PAGES.items():
            url = f"file://{ROOT / page}"
            result = run_command([
                chrome, "--headless", "--no-sandbox", "--disable-gpu",
                "--disable-remote-fonts", "--enable-logging=stderr", "--v=0", "--dump-dom", url,
            ])
            check(result.returncode == 0, f"{page} failed to render", failures)
            for marker in markers:
                check(marker in result.stdout, f"{page} missing marker: {marker}", failures)
            check(not ERROR_PATTERN.search(result.stderr), f"{page} logged console/runtime errors", failures)

            expected = EXPECTED_TASKS.get(page)
            if expected is not None:
                count = len(re.findall(r'class="task-item task-row|class="task-item done|class="task-item', result.stdout))
                check(count == expected, f"{page} rendered {count} tasks, expected {expected}", failures)
    else:
        print("SKIP  headless Chrome checks (Chrome not found; set CHROME_BIN)")

    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"  - {failure}")
        sys.exit(1)

    checks = len(PAGES) * (4 if chrome else 0) + len(list((ROOT / "assets" / "js").glob("*.js")))
    print(f"PASS  smoke checks completed ({checks} basic checks).")
    sys.exit(0)


if __name__ == "__main__":
    main()
