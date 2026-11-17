using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using TapBoard;

// Run the production contact controller and native output policy together.
// Only the OS key state and SendInput boundary are replaced; no real keys sent.
internal static class Program
{
    private static void Check(bool condition, string message)
    { if (!condition) throw new Exception(message); }

    private sealed class Rig : IDisposable
    {
        internal readonly KeyboardInputController Controller = new KeyboardInputController(0, () => 0);
        internal readonly HashSet<ushort> Physical = new HashSet<ushort>();
        internal readonly HashSet<ushort> Injected = new HashSet<ushort>();
        internal readonly List<string> Events = new List<string>();
        internal readonly WindowsKeyboardOutput Output;
        internal Func<WindowsKeyboardOutput.Input[], uint> Delivery;

        internal Rig()
        {
            Output = new WindowsKeyboardOutput(k => Physical.Contains(k) || Injected.Contains(k), inputs =>
            {
                uint sent = Delivery == null ? (uint)inputs.Length : Delivery(inputs);
                foreach (var input in inputs.Take((int)sent))
                {
                    var key = input.data.keyboard;
                    Events.Add(key.virtualKey.ToString("X2") + ":" + key.flags);
                    if ((key.flags & 2) != 0) Injected.Remove(key.virtualKey);
                    else Injected.Add(key.virtualKey);
                }
                return sent;
            });
            Output.Diagnostics = Controller.Diagnostics;
            Controller.ModifiersChanged += Output.SetModifiers;
            Controller.KeyInput += (sender, args) => Output.Send(args);
            Controller.CreateKeys(74, 1500);
        }
        internal Key Key(string label, int index = 0)
        { return Controller.keys.Where(k => k.GetLabel(false) == label).ElementAt(index); }
        internal void Contact(string label, int id, KeyAreaEvent kind, int index = 0)
        {
            Key key = Key(label, index);
            Controller.DistributeEvent(kind, id, key.x + 10, key.y + 10);
        }
        internal void Down(string label, int id, int index = 0) { Contact(label, id, KeyAreaEvent.TOUCH, index); }
        internal void Up(string label, int id, int index = 0) { Contact(label, id, KeyAreaEvent.RELEASE, index); }
        internal void Tap(string label, int id) { Down(label, id); Up(label, id); }
        internal void Expect(string sequence)
        {
            string actual = string.Join(",", Events);
            Check(actual == sequence, "Expected " + sequence + "; got " + actual);
            Events.Clear();
        }
        public void Dispose() { Output.Dispose(); }
    }

    private static void Main()
    {
        // Instantaneous synthetic taps; production timing is checked separately.
        ConfigurationManager.AppSettings.Set("TapMinDurationMs", "0");
        ConfigurationManager.AppSettings.Set("ExperimentLogging", "false");

        using (var r = new Rig())
        {
            r.Down("Alt", 1);
            r.Expect("12:0");
            r.Down("Tab", 2);
            r.Expect(""); // Still a release-based tap, not a new repeat mode.
            r.Up("Tab", 2);
            r.Tap("Tab", 3);
            r.Expect("09:0,09:2,09:0,09:2");
            Check(r.Injected.Contains(0x12), "Alt ended between Tab taps");
            r.Down("Shift", 4);
            r.Tap("Tab", 5);
            r.Up("Shift", 4);
            r.Tap("←", 6);
            r.Expect("10:0,09:0,09:2,10:2,25:1,25:3");
            Check(r.Injected.Contains(0x12), "Shift release or arrow ended Alt hold");
            r.Controller.DistributeEvent(KeyAreaEvent.MOVE, 1, -100, -100);
            r.Expect("");
            r.Controller.DistributeEvent(KeyAreaEvent.RELEASE, 1, -100, -100);
            r.Expect("12:2");
        }
        Console.WriteLine("PASS: Alt held across Tab taps, Shift+Tab, arrow and movement; release outside key.");

        using (var r = new Rig())
        {
            r.Down("Ctrl", 1);
            r.Down("Shift", 2);
            r.Tap("→", 3);
            r.Tap("→", 4);
            Check(!r.Controller.IsLocked, "Modifier shortcut consumed ordinary-key slots");
            r.Up("Shift", 2);
            r.Tap("c", 5);
            r.Up("Ctrl", 1);
            r.Expect("11:0,10:0,27:1,27:3,27:1,27:3,10:2,43:0,43:2,11:2");
        }
        using (var r = new Rig())
        {
            foreach (string label in new[] { "Shift", "Ctrl" })
            {
                r.Down(label, 1);
                r.Down(label, 2, 1);
                r.Up(label, 1);
                Check(r.Injected.Count == 1, "First side released the other side's hold");
                r.Up(label, 2, 1);
            }
            r.Expect("10:0,10:2,11:0,11:2");
            foreach (string label in new[] { "Shift", "Ctrl", "Alt", "Win" })
            {
                r.Down(label, 1);
                r.Down(label, 2);
                r.Up(label, 1);
                Check(r.Key(label).IsActive(), "Second finger lost modifier ownership");
                Check(r.Injected.Count == 1, "First finger released a shared modifier");
                r.Up(label, 2);
            }
            r.Expect("10:0,10:2,11:0,11:2,12:0,12:2,5B:1,5B:3");
        }
        Console.WriteLine("PASS: Ctrl+Shift shortcuts, both sides and multiple fingers on a modifier.");

        using (var r = new Rig())
        {
            r.Down("Alt", 1);
            r.Down("→", 2);
            r.Expect("12:0,27:1,27:3");
            System.Threading.Thread.Sleep(KeyboardSettings.Current.RepeatIntervalMs + 20);
            r.Controller.Repeat();
            r.Expect("27:1,27:3");
            r.Up("→", 2);
            System.Threading.Thread.Sleep(KeyboardSettings.Current.RepeatIntervalMs + 20);
            r.Controller.Repeat();
            r.Expect("");
            Check(r.Injected.Contains(0x12), "Arrow repeat/release ended Alt hold");
            r.Up("Alt", 1);
            r.Expect("12:2");
        }
        Console.WriteLine("PASS: held arrow repeats preserve Alt, and arrow release stops repeat.");

        using (var r = new Rig())
        {
            r.Down("Shift", 1); r.Down("Ctrl", 2); r.Down("Alt", 3); r.Down("Win", 4);
            r.Events.Clear();
            r.Down("a", 5); r.Down("s", 6); r.Down("d", 7);
            Check(r.Controller.IsLocked && r.Injected.Count == 0, "Lock did not release native modifiers");
            r.Expect("10:2,11:2,12:2,5B:3");
            r.Up("a", 5); r.Up("s", 6); r.Up("d", 7);
            Check(r.Controller.IsLocked, "Lock ignored remaining modifier contacts");
            r.Up("Shift", 1); r.Up("Ctrl", 2); r.Up("Alt", 3); r.Up("Win", 4);
            Check(!r.Controller.IsLocked, "All released contacts did not unlock");
            r.Expect("");
            r.Tap("a", 8);
            r.Expect("41:0,41:2");
        }
        using (var r = new Rig())
        {
            r.Down("Alt", 1); r.Down("Shift", 2); r.Down("Win", 3);
            r.Events.Clear();
            r.Controller.CreateKeys(72, 1500);
            Check(r.Injected.Count == 0, "Layout rebuild retained modifiers");
            r.Expect("5B:3,10:2,12:2");
            r.Down("Ctrl", 1);
            r.Controller.CancelContacts(); // Also used by touch-window destruction.
            r.Expect("11:0,11:2");
            r.Down("Alt", 1); r.Down("Shift", 2); r.Down("Ctrl", 3); r.Down("Win", 4);
            r.Events.Clear();
            r.Output.Dispose();
            r.Expect("10:2,11:2,12:2,5B:3");
            r.Output.Dispose();
            r.Controller.CancelContacts();
            r.Down("Alt", 9);
            r.Expect("");
        }
        Console.WriteLine("PASS: lock/unlock, layout rebuild, contact cancellation and idempotent shutdown cleanup.");

        using (var r = new Rig())
        {
            foreach (ushort key in new ushort[] { 0x10, 0x11, 0x12, 0x5B }) r.Physical.Add(key);
            r.Down("Shift", 1); r.Down("Ctrl", 2); r.Down("Alt", 3); r.Down("Win", 4);
            r.Tap("Tab", 5);
            r.Up("Shift", 1); r.Up("Ctrl", 2); r.Up("Alt", 3); r.Up("Win", 4);
            r.Output.Dispose();
            r.Expect("09:0,09:2");
        }
        using (var r = new Rig())
        {
            r.Physical.Add(0x12);
            r.Down("Alt", 1);
            r.Physical.Clear();
            r.Tap("Tab", 2); // Acquire before the next key if the borrowed hold ended.
            r.Up("Alt", 1);
            r.Expect("12:0,09:0,09:2,12:2");
        }
        Console.WriteLine("PASS: pre-existing physical modifiers are not released; acquire after borrowed hold ends.");

        using (var r = new Rig())
        {
            r.Delivery = inputs => 0;
            r.Down("Alt", 1);
            r.Tap("Tab", 2);
            r.Expect("");
            r.Delivery = null;
            r.Tap("Tab", 3);
            r.Expect("12:0,09:0,09:2");
            r.Delivery = inputs => 0;
            r.Up("Alt", 1);
            Check(r.Injected.Contains(0x12), "Failed release lost ownership");
            r.Delivery = null;
            r.Output.Dispose();
            r.Expect("12:2");
        }
        using (var r = new Rig())
        {
            r.Delivery = inputs => 1;
            Check(!r.Output.Send(new KeyInputEventArgs { key = "{LEFT}" }), "Partial delivery reported success");
            r.Expect("25:1,25:3");
            Check(r.Injected.Count == 0, "Partial ordinary-key send left a key down");
        }
        Console.WriteLine("PASS: failed modifier down blocks target; retries and failed-release cleanup; partial target cleanup.");

        using (var r = new Rig())
        {
            r.Tap("한/영", 1); r.Tap("한자", 2); r.Tap("Caps Lock", 3);
            r.Expect("15:0,15:2,19:0,19:2,14:0,14:2");
            r.Down("Shift", 4); r.Down("a", 5); r.Up("Shift", 4); r.Up("a", 5);
            r.Expect("10:0,10:2,41:0,41:2"); // Modifier sampled at tap commit, as before.
            Check(r.Key("Tab").Definition.type == Key.TYPE.TAPPER, "Tab repeat policy changed");
        }
        Console.WriteLine("PASS: IME/Caps Lock, release-time Shift semantics and unchanged Tab tap policy.");
    }
}
