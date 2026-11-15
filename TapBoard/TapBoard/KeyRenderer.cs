using System;
using System.Drawing;

namespace TapBoard
{
    // Drawing never changes contacts or emits input.
    internal sealed class KeyRenderer : IDisposable
    {
        private Font latinFont, koreanFont;
        private float cachedSize;
        private readonly StringFormat centered = new StringFormat
        { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

        private Font GetFont(float size, bool korean)
        {
            // Reuse two fonts across all keys and frames. Recreate only when
            // display calibration changes, keeping GDI allocation off hot paths.
            if (latinFont == null || cachedSize != size)
            {
                latinFont?.Dispose();
                koreanFont?.Dispose();
                latinFont = new Font("Tahoma", size, GraphicsUnit.Pixel);
                koreanFont = new Font("Malgun Gothic", size, GraphicsUnit.Pixel);
                cachedSize = size;
            }
            return korean ? koreanFont : latinFont;
        }
        public void Dispose()
        {
            latinFont?.Dispose();
            koreanFont?.Dispose();
            centered.Dispose();
        }
        internal void Draw(Key key, Graphics canvas, int keyMargin, bool shift, bool control, float fontSize,
            bool korean = false, bool capsLock = false, bool disabled = false)
        {
            Rectangle rect = key.VisualBounds;
            rect.Inflate(keyMargin, keyMargin);     // to the key top area

            // A lock dims the base palette; it does not reuse the active color.
            Color baseColor = key.GetName() == "{CAPSLOCK}" && capsLock ? KeyboardTheme.CapsLock : key.Definition.color;
            Color fill = disabled
                ? Color.FromArgb(baseColor.A, (int)(baseColor.R * KeyboardSettings.Current.LockedBrightness),
                    (int)(baseColor.G * KeyboardSettings.Current.LockedBrightness), (int)(baseColor.B * KeyboardSettings.Current.LockedBrightness))
                : key.GetName() == "{CAPSLOCK}" && capsLock && !key.IsActive()
                    ? KeyboardTheme.CapsLock : (key.IsActive() ? (key.IsExpired() ? KeyboardTheme.Resting : KeyboardTheme.Active) : key.Definition.color);
            SolidBrush brush = new SolidBrush(fill);
            canvas.FillRectangle(brush, rect);
            brush.Dispose();
            canvas.DrawRectangle(Pens.White, rect);

            if (key.GetName() == "{APP_EXIT}")
            {
                // Draw a power symbol instead of relying on a font glyph.
                float diameter = Math.Min(rect.Width, rect.Height) * 0.55f;
                float cx = rect.Left + rect.Width / 2f;
                float cy = rect.Top + rect.Height / 2f;
                using (Pen pen = new Pen(Color.White, Math.Max(1.5f, diameter / 12)))
                {
                    canvas.DrawArc(pen, cx - diameter / 2, cy - diameter / 2,
                        diameter, diameter, -50, 280);
                    canvas.DrawLine(pen, cx, cy - diameter * 0.65f, cx, cy);
                }
            }
            else
            {
                Font font = GetFont(fontSize, korean);
                using (SolidBrush labelBrush = new SolidBrush(control ? KeyboardTheme.ShortcutLabel : KeyboardTheme.Label))
                    canvas.DrawString(key.GetLabel(shift, korean, capsLock), font, labelBrush, rect, centered);
            }
        }
    }
}
