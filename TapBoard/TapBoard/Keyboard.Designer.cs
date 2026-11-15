namespace TapBoard
{
    partial class Keyboard
    {
        /// <summary>
        /// Required designer container.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Dispose the resources owned by the form.
        /// </summary>
        /// <param name="disposing">True when managed resources should be released.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Forms generated code

        /// <summary>
        /// Initialize the form and keyboard surface.
        /// Maintain control initialization in designer order.
        /// </summary>
        private void InitializeComponent()
        {
            this.keyArea = new TapBoard.KeyArea();
            this.SuspendLayout();
            // 
            // keyArea
            // 
            this.keyArea.BackColor = System.Drawing.Color.Black;
            this.keyArea.Dock = System.Windows.Forms.DockStyle.Fill;
            this.keyArea.Location = new System.Drawing.Point(0, 96);
            this.keyArea.Margin = new System.Windows.Forms.Padding(0);
            this.keyArea.Name = "keyArea";
            this.keyArea.Size = new System.Drawing.Size(1396, 403);
            this.keyArea.TabIndex = 1;
            this.keyArea.Text = "keyArea";
            this.keyArea.KeyInput += new TapBoard.KeyArea.KeyInputEventHandler(this.keyArea_KeyInput);
            // 
            // Keyboard
            // 
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
            this.BackColor = System.Drawing.Color.Indigo;
            this.ClientSize = new System.Drawing.Size(1396, 499);
            this.Controls.Add(this.keyArea);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
            this.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.MaximizeBox = false;
            this.Name = "Keyboard";
            this.ShowIcon = false;
            this.Text = "TapBoard";
            this.TopMost = true;
            this.Load += new System.EventHandler(this.Keyboard_Load);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private KeyArea keyArea;


    }
}
