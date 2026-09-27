import importlib.util
from importlib.machinery import SourceFileLoader
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT_PATH = Path(__file__).parents[1] / "deploy" / "pi-live" / "opencourt-player"
LOADER = SourceFileLoader("opencourt_player", str(SCRIPT_PATH))
SPEC = importlib.util.spec_from_loader("opencourt_player", LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load opencourt-player")
PLAYER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLAYER)


class PlayerSupervisorTests(unittest.TestCase):
    def test_published_url_becomes_top_level_embed(self):
        value = (
            "https://docs.google.com/presentation/d/e/published-id/pub"
            "?start=false&loop=false"
        )
        self.assertEqual(
            PLAYER.google_slides_url(value),
            "https://docs.google.com/presentation/d/e/published-id/embed"
            "?start=true&loop=true&delayms=10000",
        )

    def test_viewer_url_becomes_top_level_present(self):
        value = "https://docs.google.com/presentation/d/presentation-id/edit?usp=sharing"
        self.assertEqual(
            PLAYER.google_slides_url(value),
            "https://docs.google.com/presentation/d/presentation-id/present"
            "?usp=sharing&start=true&loop=true&delayms=10000",
        )

    def test_non_google_slides_url_is_rejected(self):
        with self.assertRaises(PLAYER.ConfigError):
            PLAYER.google_slides_url("https://example.com/presentation")

    def test_image_source_is_local_and_revisioned(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            (content_dir / "player.html").write_text("player", encoding="utf-8")
            (content_dir / "board.jpg").write_bytes(b"image")
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
