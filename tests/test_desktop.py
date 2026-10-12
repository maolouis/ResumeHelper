import tempfile
import tkinter as tk
import unittest
from pathlib import Path

from app.desktop import ResumeHelperApp
from app.storage import DataStore


class DesktopEmptyStateTests(unittest.TestCase):
    def test_empty_profile_state_can_create_and_return_to_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = tk.Tk()
            root.withdraw()
            try:
                store = DataStore(Path(directory) / "data")
                app = ResumeHelperApp(root, store)
                root.update_idletasks()

                self.assertFalse(app.profile)
                self.assertEqual("disabled", str(app.profile_combo.cget("state")))
                self.assertEqual("pack", app.empty_profile_message.winfo_manager())
                self.assertEqual("disabled", str(app.notebook.tab(1, "state")))
                self.assertEqual("disabled", str(app.export_profile_button.cget("state")))

                created = store.create_profile("空白档案")
                app.refresh_all()
                root.update_idletasks()
                self.assertEqual(created["id"], app.profile["id"])
                self.assertEqual("readonly", str(app.profile_combo.cget("state")))
                self.assertEqual("", app.empty_profile_message.winfo_manager())
                self.assertEqual("normal", str(app.notebook.tab(1, "state")))

                store.delete_profile(created["id"])
                app.refresh_all()
                root.update_idletasks()
                self.assertFalse(app.profile)
                self.assertEqual("pack", app.empty_profile_message.winfo_manager())
                self.assertEqual("disabled", str(app.delete_profile_button.cget("state")))
            finally:
                root.destroy()


if __name__ == "__main__":
    unittest.main()
