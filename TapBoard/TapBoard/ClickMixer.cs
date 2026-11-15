using System;
using System.Drawing;
using System.Collections.Generic;
using System.Diagnostics;

namespace TapBoard
{
    // Pure synthesis: no device calls, allocations, or waits during Render.
    internal sealed class ClickMixer
    {
        private readonly float[] click;
        private readonly float[] touch;
        private readonly float[] tail;
        private int position;
        internal ClickMixer(int rate)
        {
            // Related timbres: quiet, low key-down; brighter key-up confirmation.
            var settings = KeyboardSettings.Current;
            click = MakeClick(rate, settings.InputDurationSeconds, settings.InputFrequencyHz, settings.InputGain);
            touch = MakeClick(rate, settings.TouchDurationSeconds, settings.TouchFrequencyHz, settings.TouchGain, true);
            tail = new float[Math.Max(click.Length, touch.Length)];
        }
        private static float[] MakeClick(int rate, double duration, double frequency, double gain, bool softTouch = false)
        {
            float[] samples = new float[Math.Max(1, (int)Math.Round(rate * duration))];
            for (int i = 0; i < samples.Length; i++)
            {
                double time = i / (double)rate;
                // A raised-cosine onset and decaying sine avoid a sharp spark-like click.
                // Longer tails change timbre, not when playback is scheduled.
                double attack = 0.5 - 0.5 * Math.Cos(Math.PI * Math.Min(1, time / (softTouch ? 0.003 : 0.001)));
                double remaining = (samples.Length - 1 - i) / (double)rate;
                double release = 0.5 - 0.5 * Math.Cos(Math.PI * Math.Min(1, remaining / 0.008));
                double fundamental = Math.Sin(2 * Math.PI * frequency * time) * Math.Exp(-time / (softTouch ? 0.020 : 0.014));
                samples[i] = (float)(gain * attack * release * fundamental);
            }
            return samples;
        }
        private void Mix(float[] sound, int requests)
        {
            if (requests > 0)
                for (int i = 0; i < sound.Length; i++)
                    tail[(position + i) % tail.Length] += requests * sound[i];
        }
        internal void Render(float[] output, int frames, int channels, int requests)
        {
            RenderFeedback(output, frames, channels, requests, 0);
        }
        internal void RenderFeedback(float[] output, int frames, int channels, int requests, int touches)
        {
            Mix(click, requests);
            Mix(touch, touches);
            for (int frame = 0; frame < frames; frame++)
            {
                float sample = Math.Max(-1f, Math.Min(1f, tail[position]));
                tail[position] = 0;
                position = (position + 1) % tail.Length;
                for (int channel = 0; channel < channels; channel++) output[frame * channels + channel] = sample;
            }
        }
    }

}
