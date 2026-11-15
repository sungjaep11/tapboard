param([string]$Path)
Add-Type @"
using System;
using System.Reflection;
using System.Reflection.Emit;
using System.Collections.Generic;
public class ILRead {
public static void Dump(string path) {
 var a=Assembly.LoadFrom(path); var ops=new Dictionary<short,OpCode>();
 foreach(var f in typeof(OpCodes).GetFields()) if(f.FieldType==typeof(OpCode)) { var o=(OpCode)f.GetValue(null);ops[o.Value]=o; }
 foreach(var t in a.GetTypes()) if(t.Name=="TouchHandler" || t.Name=="Handler" || t.Name.Contains("DecodeMessage"))
 foreach(var m in t.GetMethods(BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.DeclaredOnly)) if(m.Name=="DecodeMessage"||m.Name=="WindowProc"||m.Name=="WindowProcSubClass"||m.Name=="MoveNext") {
 if(m.GetMethodBody()==null)continue; Console.WriteLine(t.FullName+"."+m.Name); var b=m.GetMethodBody().GetILAsByteArray(); int p=0;
 while(p<b.Length) {int start=p; short c=b[p++];if(c==254)c=(short)(0xfe00|b[p++]);var o=ops[c]; string arg="";int n=0;
 switch(o.OperandType) {case OperandType.InlineNone:break;case OperandType.ShortInlineI:case OperandType.ShortInlineVar:case OperandType.ShortInlineBrTarget:n=1;arg=b[p].ToString();break;case OperandType.InlineVar:n=2;arg=BitConverter.ToUInt16(b,p).ToString();break;case OperandType.InlineI8:case OperandType.InlineR:n=8;break;case OperandType.InlineSwitch:int ct=BitConverter.ToInt32(b,p);n=4+ct*4;break;default:n=4;int token=BitConverter.ToInt32(b,p);arg=token.ToString();try { if(o.OperandType==OperandType.InlineMethod||o.OperandType==OperandType.InlineField||o.OperandType==OperandType.InlineType||o.OperandType==OperandType.InlineTok)arg=m.Module.ResolveMember(token).ToString(); }catch{}break;}
 p+=n;Console.WriteLine(start.ToString("X4")+" "+o.Name+" "+arg);
 }
 }
}
}
"@
[ILRead]::Dump((Resolve-Path $Path).Path)


