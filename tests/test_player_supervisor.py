import importlib.util
from importlib.machinery import SourceFileLoader
import hashlib
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = Path(__file__).parents[1] / "deploy" / "pi-live" / "opencourt-player"
LOADER = SourceFileLoader("opencourt_player", str(SCRIPT_PATH))
SPEC = importlib.util.spec_from_loader("opencourt_player", LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load opencourt-player")
PLAYER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLAYER)


class PlayerSupervisorTests(unittest.TestCase):
    def test_slideshow_preserves_order_timing_and_one_image(self):
        from urllib.parse import parse_qs, urlparse
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "player.html").write_text("player")
            for name in ["first.png", "second.png"]:
                (root / name).write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (3840).to_bytes(4, "big") + (2160).to_bytes(4, "big"))
            with mock.patch.object(PLAYER, "CONTENT_DIR", root):
                source = {"type": "image_slideshow", "durationSeconds": 12,
                          "slides": [{"type": "image", "url": name} for name in ["second.png", "first.png"]]}
                query = parse_qs(urlparse(PLAYER.target_url({"revision": 2, "source": source})).query)
                self.assertEqual(query["durationSeconds"], ["12"])
                self.assertEqual([slide["image"] for slide in json.loads(query["slides"][0])], ["second.png", "first.png"])
                source["slides"] = source["slides"][:1]
                PLAYER.prepare_config({"revision": 2, "source": source})
                for invalid in [0, 2, 301, True, "15"]:
                    source["durationSeconds"] = invalid
                    with self.assertRaises(PLAYER.ConfigError):
                        PLAYER.target_url({"revision": 2, "source": source})

    def test_failed_pending_slideshow_keeps_persisted_content_for_offline_reboot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "player.html").write_text("player")
            (root / "old.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (3840).to_bytes(4, "big") + (2160).to_bytes(4, "big"))
            path = root / "device-config.json"
            old = {"schemaVersion": 1, "deviceId": "bar", "revision": 1,
                   "source": {"type": "image", "url": "old.png"}}
            PLAYER.write_config_atomically(old, path)
            pending = {**old, "revision": 2, "source": {"type": "image_slideshow",
                       "durationSeconds": 15, "slides": [
                           {"type": "image", "url": "https://example.com/first.png"},
                           {"type": "image", "url": "https://example.com/missing.png"}]}}
            with mock.patch.object(PLAYER, "CONTENT_DIR", root), mock.patch.object(
                PLAYER, "cache_remote_image", side_effect=["old.png", OSError("offline")]
            ) as cache:
                with self.assertRaises(OSError):
                    PLAYER.prepare_config(pending)
                self.assertEqual(cache.call_count, 2)
                # Simulate a fresh process with no network and reload only persisted state.
                restored = PLAYER.load_config(path)
                self.assertEqual(restored, old)
                self.assertIn("image=old.png", PLAYER.target_url(restored))

    def test_prepare_stages_future_scheduled_slideshow_before_acceptance(self):
        source = {"type": "google_slides", "url": "https://docs.google.com/presentation/d/test/preview"}
        config = {"revision": 3, "source": source, "mode": "schedule", "schedule": {
            "timezone": "Australia/Melbourne", "fallback": {"source": source}, "entries": [
                {"day": "Monday", "startTime": "10:00", "endTime": "11:00", "source": {
                    "type": "image_slideshow", "slides": [{"type": "image", "url": "missing.png"}]}}
            ]}}
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.prepare_config(config)

    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser playback harness")
    def test_browser_rotates_in_order_and_waits_for_all_images(self):
        html = (SCRIPT_PATH.parent / "player.html").read_text()
        script = html.split("<script>", 1)[1].split("</script>", 1)[0]
        harness = r"""
const assert = require('node:assert/strict');
const vm = require('node:vm');
async function run(slides) {
  const loaded = [], shown = [], timers = [];
  const context = {
    URLSearchParams, console,
    window: {location: {search: '?' + new URLSearchParams({slides: JSON.stringify(slides.map(image => ({image}))), durationSeconds: '12'})}},
    document: {querySelector: () => ({}), body: {replaceChildren: image => shown.push(image.src), append: image => shown.push(image.src)}},
    Image: class {constructor() {this.classList = {add() {}, remove() {}}; this.style = {};} remove() {} set src(value) {this._src = value; loaded.push(this);} get src() {return this._src;}},
    setInterval: (callback, delay) => timers.push({callback, delay}),
    setTimeout: callback => callback(),
  };
  vm.runInNewContext(SCRIPT, context);
  loaded[0].onload();
  await new Promise(resolve => setImmediate(resolve));
  if (loaded.length > 1) assert.equal(shown.length, 0);
  for (const image of loaded.slice(1)) image.onload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown.length, 1);
  assert.ok(shown[0].startsWith(slides[0]));
  if (slides.length > 1) {
    assert.equal(timers[0].delay, 12000);
    timers[0].callback();
    assert.ok(shown[1].startsWith(slides[1]));
    timers[0].callback();
    assert.ok(shown[2].startsWith(slides[0]));
  } else assert.equal(timers.length, 0);
}
(async () => {await run(['first.png', 'second.png']); await run(['only.png']);})().catch(error => {console.error(error); process.exitCode = 1;});
"""
        subprocess.run(["node", "-e", "const SCRIPT = " + json.dumps(script) + ";\n" + harness], check=True)

    def test_cached_image_is_revalidated_and_pixel_bombs_are_rejected(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big")
        source = {"url": "https://example.com/image.png", "sha256": "0" * 64}
        name = hashlib.sha256(f"{source['url']}|1".encode()).hexdigest()[:24] + ".png"
        with tempfile.TemporaryDirectory() as directory:
            asset_dir = Path(directory)
            (asset_dir / name).write_bytes(png)
            with mock.patch.object(PLAYER, "ASSET_DIR", asset_dir):
                with self.assertRaisesRegex(PLAYER.ConfigError, "checksum"):
                    PLAYER.cache_remote_image(source, "1")
        bomb = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (100000).to_bytes(4, "big") + (100000).to_bytes(4, "big")
        with self.assertRaisesRegex(PLAYER.ConfigError, "pixel"):
            PLAYER.validate_image_payload(bomb, {})

    def test_aggregate_image_budget_is_enforced_before_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "player.html").write_text("player")
            png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (3840).to_bytes(4, "big") + (2160).to_bytes(4, "big")
            slides = []
            for index in range(8):
                name = f"slide{index}.png"
                (root / name).write_bytes(png)
                slides.append({"type": "image", "url": name})
            config = {"revision": 1, "source": {"type": "image_slideshow", "slides": slides}}
            with mock.patch.object(PLAYER, "CONTENT_DIR", root):
                with self.assertRaisesRegex(PLAYER.ConfigError, "combined"):
                    PLAYER.prepare_config(config)
                config["source"]["slides"] = slides[:2]
                with mock.patch.object(PLAYER, "MAX_CONFIG_IMAGE_BYTES", 1):
                    with self.assertRaisesRegex(PLAYER.ConfigError, "combined"):
                        PLAYER.prepare_config(config)

    def test_immutable_cache_reuses_bytes_across_revisions_and_offline_upgrade(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big")
        source = {"url": "https://example.com/image.png", "sha256": hashlib.sha256(png).hexdigest()}
        legacy_name = hashlib.sha256(f"{source['url']}|1".encode()).hexdigest()[:24] + ".png"
        with tempfile.TemporaryDirectory() as directory:
            asset_dir = Path(directory)
            (asset_dir / legacy_name).write_bytes(png)
            with mock.patch.object(PLAYER, "ASSET_DIR", asset_dir), mock.patch.object(
                PLAYER, "urlopen", side_effect=AssertionError("network must not be needed")
            ):
                migrated = PLAYER.cache_remote_image(source, "1")
                reused = PLAYER.cache_remote_image(source, "2")
            self.assertEqual(migrated, reused)
            self.assertNotEqual(Path(migrated).name, legacy_name)
            self.assertEqual((asset_dir / Path(migrated).name).read_bytes(), png)
            self.assertTrue((asset_dir / legacy_name).is_file())

    def test_published_url_becomes_top_level_embed(self):
        value = (
            "https://docs.google.com/presentation/d/e/published-id/pub"
            "?start=false&loop=false"
        )
        self.assertEqual(
            PLAYER.google_slides_url(value),
            "https://docs.google.com/presentation/d/e/published-id/embed"
            "?start=true&loop=true&delayms=10000&rm=minimal",
        )

    def test_viewer_url_becomes_minimal_top_level_preview(self):
        value = "https://docs.google.com/presentation/d/presentation-id/edit?usp=sharing"
        self.assertEqual(
            PLAYER.google_slides_url(value),
            "https://docs.google.com/presentation/d/presentation-id/preview"
            "?usp=sharing&start=true&loop=true&delayms=10000&rm=minimal",
        )

    def test_non_google_slides_url_is_rejected(self):
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.google_slides_url("https://example.com/presentation")

    def test_image_source_is_local_and_revisioned(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            (content_dir / "player.html").write_text("player", encoding="utf-8")
            (content_dir / "board.jpg").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (3840).to_bytes(4, "big") + (2160).to_bytes(4, "big"))
            original_content_dir = PLAYER.CONTENT_DIR
            PLAYER.CONTENT_DIR = content_dir
            try:
                result = PLAYER.target_url(
                    {
                        "revision": 7,
                        "source": {
                            "type": "image",
                            "url": "board.jpg",
                            "expectedWidth": 3840,
                            "expectedHeight": 2160,
                        },
                    }
                )
            finally:
                PLAYER.CONTENT_DIR = original_content_dir

            self.assertTrue(result.startswith((content_dir / "player.html").as_uri()))
            self.assertIn("image=board.jpg", result)
            self.assertIn("revision=7", result)

    def test_load_config_requires_schema_and_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text(
                json.dumps({"schemaVersion": 1, "revision": 1, "source": {"type": "image"}}),
                encoding="utf-8",
            )
            self.assertEqual(PLAYER.load_config(config_path)["revision"], 1)

            config_path.write_text(
                json.dumps({"schemaVersion": 2, "revision": 1, "source": {"type": "image"}}),
                encoding="utf-8",
            )
            with self.assertRaises(PLAYER.ConfigError):
                PLAYER.load_config(config_path)

            config_path.write_text(
                json.dumps({"schemaVersion": 1, "revision": "1", "source": {"type": "image"}}),
                encoding="utf-8",
            )
            with self.assertRaises(PLAYER.ConfigError):
                PLAYER.load_config(config_path)

    def test_schedule_uses_melbourne_windows_and_honours_fallback(self):
        honours = {"type": "image", "url": "honours-board.jpg"}
        config = {
            "schemaVersion": 1,
            "revision": 2,
            "source": honours,
            "mode": "schedule",
            "schedule": {
                "timezone": "Australia/Melbourne",
                "fallback": {"contentId": "honours-board", "name": "Honours Board", "source": honours},
                "entries": [
                    {"day": "Tuesday", "startTime": "14:00", "endTime": "17:00", "contentId": "tue-ladies", "name": "Tuesday Mid-week Ladies", "source": {"type": "google_slides", "url": "https://docs.google.com/presentation/d/tuesday/preview"}},
                    {"day": "Tuesday", "startTime": "17:00", "endTime": "24:00", "contentId": "tue-night", "name": "Tuesday Night", "source": {"type": "google_slides", "url": "https://docs.google.com/presentation/d/tuesday-night/preview"}},
                ],
            },
        }
        self.assertEqual(
            PLAYER.scheduled_source(config, datetime(2026, 9, 29, 13, 59))["url"],
            "honours-board.jpg",
        )
        self.assertEqual(
            PLAYER.scheduled_source(config, datetime(2026, 9, 29, 14, 0))["url"],
            "https://docs.google.com/presentation/d/tuesday/preview",
        )
        self.assertEqual(
            PLAYER.scheduled_source(config, datetime(2026, 9, 29, 17, 0))["url"],
            "https://docs.google.com/presentation/d/tuesday-night/preview",
        )
        self.assertEqual(
            PLAYER.scheduled_source(config, datetime(2026, 9, 29, 23, 59))["url"],
            "https://docs.google.com/presentation/d/tuesday-night/preview",
        )

    def test_remote_png_is_dimension_checked_and_cached_atomically(self):
        png = (
            b"\x89PNG\r\n\x1a\n"
            + b"\x00\x00\x00\rIHDR"
            + (3840).to_bytes(4, "big")
            + (2160).to_bytes(4, "big")
            + b"\x08\x02\x00\x00\x00"
        )

        class Response:
            headers = {"Content-Length": str(len(png)), "Content-Type": "image/png"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return png

        with tempfile.TemporaryDirectory() as directory:
            original_asset_dir = PLAYER.ASSET_DIR
            PLAYER.ASSET_DIR = Path(directory) / "assets"
            try:
                relative = PLAYER.cache_remote_image(
                    {
                        "url": "https://display.example/honours.png",
                        "expectedWidth": 3840,
                        "expectedHeight": 2160,
                        "sha256": hashlib.sha256(png).hexdigest(),
                    },
                    "9",
                    lambda _request, timeout: Response(),
                )
            finally:
                PLAYER.ASSET_DIR = original_asset_dir

            self.assertTrue(relative.startswith("assets/"))
            self.assertEqual((Path(directory) / relative).read_bytes(), png)

    def test_remote_image_rejects_wrong_dimensions_and_non_https(self):
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.cache_remote_image({"url": "http://display.example/board.jpg"}, "1")

        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big")

        class Response:
            headers = {"Content-Type": "image/png"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return png

        with tempfile.TemporaryDirectory() as directory:
            original_asset_dir = PLAYER.ASSET_DIR
            PLAYER.ASSET_DIR = Path(directory) / "assets"
            try:
                with self.assertRaises(PLAYER.ConfigError):
                    PLAYER.cache_remote_image(
                        {"url": "https://display.example/board.png", "expectedWidth": 3840},
                        "1",
                        lambda _request, timeout: Response(),
                    )
                with self.assertRaises(PLAYER.ConfigError):
                    PLAYER.cache_remote_image(
                        {
                            "url": "https://display.example/board.png",
                            "expectedWidth": 1920,
                            "sha256": "0" * 64,
                        },
                        "2",
                        lambda _request, timeout: Response(),
                    )
            finally:
                PLAYER.ASSET_DIR = original_asset_dir

    def test_remote_settings_are_optional_and_require_https(self):
        with tempfile.TemporaryDirectory() as directory:
            settings_path = Path(directory) / "remote.json"
            settings_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "deviceId": "honours-board-tv",
                        "configUrl": "",
                    }
                ),
                encoding="utf-8",
            )
            self.assertIsNone(PLAYER.load_remote_settings(settings_path))

            settings_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "deviceId": "honours-board-tv",
                        "configUrl": "http://example.com/config.json",
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaises(PLAYER.ConfigError):
                PLAYER.load_remote_settings(settings_path)

    def test_remote_fetch_sends_etag_and_validates_device(self):
        candidate = {
            "schemaVersion": 1,
            "deviceId": "honours-board-tv",
            "revision": 4,
            "pollIntervalSeconds": 60,
            "source": {
                "type": "google_slides",
                "url": "https://docs.google.com/presentation/d/presentation-id/edit",
            },
        }
        requests = []

        class Response:
            headers = {"Content-Length": "250", "ETag": '"revision-4"'}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return json.dumps(candidate).encode()

        def opener(request, timeout):
            requests.append((request, timeout))
            return Response()

        result, etag = PLAYER.fetch_remote_config(
            {
                "deviceId": "honours-board-tv",
                "configUrl": "https://display.example/config.json",
            },
            '"revision-3"',
            opener,
        )

        self.assertEqual(result, candidate)
        self.assertEqual(etag, '"revision-4"')
        self.assertEqual(requests[0][0].get_header("If-none-match"), '"revision-3"')
        self.assertEqual(requests[0][1], 10)

        candidate["deviceId"] = "another-tv"
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.fetch_remote_config(
                {
                    "deviceId": "honours-board-tv",
                    "configUrl": "https://display.example/config.json",
                },
                None,
                opener,
            )

    def test_status_report_uses_separate_device_credential(self):
        requests = []

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def opener(request, timeout):
            requests.append((request, timeout))
            return Response()

        with mock.patch.object(
            PLAYER,
            "device_diagnostics",
            return_value={"network": {"primaryIp": "192.168.1.42"}},
        ):
            PLAYER.report_device_status(
                {
                    "statusUrl": "https://display.example/status",
                    "statusToken": "a" * 32,
                },
                7,
                opener,
            )
        request, timeout = requests[0]
        self.assertEqual(timeout, 15)
        self.assertEqual(request.get_header("Authorization"), f"Bearer {'a' * 32}")
        self.assertEqual(json.loads(request.data)["revision"], 7)

    def test_browser_hides_cursor_in_kiosk_mode(self):
        command = PLAYER.browser_command("https://example.test")
        self.assertIn("--ash-hide-cursor-in-kiosk", command)
        self.assertIn("--hide-scrollbars", command)

    def test_atomic_config_write_replaces_complete_document(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "device-config.json"
            config_path.write_text("old", encoding="utf-8")
            candidate = {
                "schemaVersion": 1,
                "deviceId": "honours-board-tv",
                "revision": 5,
                "source": {"type": "google_slides"},
            }

            PLAYER.write_config_atomically(candidate, config_path)

            self.assertEqual(json.loads(config_path.read_text(encoding="utf-8")), candidate)
            self.assertFalse(config_path.with_suffix(".json.tmp").exists())

    def test_remote_revision_must_move_forward(self):
        local = {"revision": 3}

        PLAYER.require_newer_remote_revision({"revision": 4}, local)

        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.require_newer_remote_revision({"revision": 3}, local)
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.require_newer_remote_revision({"revision": 2}, local)

        PLAYER.require_newer_remote_revision({"revision": 1}, None)


if __name__ == "__main__":
    unittest.main()
