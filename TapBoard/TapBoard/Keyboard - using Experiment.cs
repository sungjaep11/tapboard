using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Text;
using System.Windows.Forms;
using System.IO;

namespace TapBoard
{
    public struct KeyMessage
    {
        public Message msg;
        public Key key;
    }
    
    public partial class Keyboard : Form
    {
        private readonly Experiment exp = new Experiment();

        public Keyboard()
        {
            InitializeComponent();
            
            exp.NewProblem();
            labeltext.Text = exp.GetProblem();
            keyArea.streamWriter1.WriteLine((DateTime.UtcNow - keyArea.baseTime).Ticks / 10000 + ", 1, " + exp.GetProblem());
            keyArea.streamWriter2.Write(exp.GetProblem().Length + ", ");
        }

        delegate void InvokeCallback(object sender, KeyInputEventArgs args);

        private void keyArea_KeyInput(object sender, KeyInputEventArgs args)
        {
            if (textBox.InvokeRequired)
            {
                InvokeCallback cb = new InvokeCallback(keyArea_KeyInput);
                Invoke(cb, sender, args);
            }
            else
            {
                int tempcount = textBox.LineCount;
                string temptext = textBox.Text;
                if (args.inKey == (char)8)  // BS
                {
                    if (temptext.Length > 0)
                    {
                        textBox.Text = "";
                        textBox.AppendText(temptext.Substring(0, temptext.Length - 1));
                    }
                }
                else if (args.inKey == (char)13)    // CR
                {
                    keyArea.streamWriter2.WriteLine(labeltext.Text + ", " + textBox.Text);
                    textBox.Text = "";
                    exp.NewProblem();
                    labeltext.Text = exp.GetProblem();
                    keyArea.streamWriter1.WriteLine((DateTime.UtcNow - keyArea.baseTime).Ticks / 10000 + ", 1, " + exp.GetProblem());
                    keyArea.streamWriter1.Flush();
                    keyArea.streamWriter2.Write(exp.GetProblem().Length + ", ");
                    keyArea.streamWriter2.Flush();
                }
                else
                {
                    textBox.AppendText(args.inKey.ToString());
                }
                textBox.SelectionStart = textBox.Text.Length;
                if (tempcount != textBox.LineCount)
                {
                    textBox.ScrollToCaret();
                }
            }
        }
    }
}
