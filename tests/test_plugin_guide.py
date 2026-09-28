import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
GUIDE = STATIC / "plugin-guide.html"
RUNBOOK = ROOT / "docs" / "PLUGIN-SETUP.md"


class PluginGuideTests(unittest.TestCase):
    def test_help_links_to_local_plugin_guide(self):
        index = (STATIC / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/plugin-guide.html"', index)

    def test_guide_covers_each_reviewed_plugin_once(self):
        guide = GUIDE.read_text(encoding="utf-8")
        repositories = [
            "fross100/omaplug",
            "twiking/omasettings",
            "ryanrhughes/omapager",
            "AROICE-HQ/omarchy-bluetooth",
            "jankeesvw/omarchy-notification-center",
            "clickety-clacks/vimarchy",
            "bobby-nicholas/omaland",
            "TyRichards/omarchy-tray",
            "brentkearney/omdrop-plugin",
            "kristofferR/omarchy-expose",
            "TheTrueFerret/omarchy-decent-workspaces",
            "huacnlee/omarchy-which-key",
        ]
        for repository in repositories:
            with self.subTest(repository=repository):
                self.assertEqual(guide.count(f"github.com/{repository}"), 1)

    def test_guide_uses_local_accessible_previews(self):
        guide = GUIDE.read_text(encoding="utf-8")
        images = [
            source
            for source in re.findall(r'<img\s+[^>]*src="([^"]+)"[^>]*>', guide)
            if source.startswith("/assets/plugin-guide/")
        ]
        self.assertEqual(len(images), 12)
        for source in images:
            with self.subTest(source=source):
                self.assertTrue(source.startswith("/assets/plugin-guide/"))
                self.assertTrue((STATIC / source.removeprefix("/")).is_file())
        preview_tags = re.findall(r'<img\s+[^>]*src="/assets/plugin-guide/[^"]+"[^>]*>', guide)
        self.assertTrue(all(re.search(r'alt="[^"]+"', tag) for tag in preview_tags))

    def test_guide_is_review_only_and_marks_risk(self):
        guide = GUIDE.read_text(encoding="utf-8")
        self.assertNotIn("data-install", guide)
        self.assertIn("Not for this HP", guide)
        self.assertIn("Apple Silicon", guide)
        self.assertIn("Owner tool", guide)
        self.assertIn("Install now", guide)
        self.assertIn("unsandboxed", guide.lower())

    def test_runbook_has_only_the_four_approved_initial_installs(self):
        runbook = RUNBOOK.read_text(encoding="utf-8")
        commands = re.findall(r"^omarchy plugin add .+ --enable$", runbook, re.MULTILINE)
        self.assertEqual(
            commands,
            [
                "omarchy plugin add https://github.com/fross100/omaplug.git --enable",
                "omarchy plugin add https://github.com/huacnlee/omarchy-which-key.git --enable",
                "omarchy plugin add https://github.com/kristofferR/omarchy-expose.git --enable",
                "omarchy plugin add https://github.com/jankeesvw/omarchy-notification-center.git --enable",
            ],
        )
        self.assertIn("omarchy plugin list --json", runbook)
        self.assertIn("one at a time", runbook.lower())
        self.assertIn("review the diff", runbook.lower())


if __name__ == "__main__":
    unittest.main()
