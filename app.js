const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// Opret Supabase-klient via Railway miljøvariabler
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Logger hver licens-check i separat tabel
async function logLicenseCheck(license, machine, status) 
{
  try {
    const { data, error } = await supabase
      .from("LicenseChecked")
      .insert([{ license, machine, status }])
      .select();
    console.log(license)
    if (error) console.error("DB error:", error);
    else console.log("Inserted:", data);
  } catch (err) {
    console.error("Log error:", err);
  }
}

// API-endpoint til licensvalidering
app.post("/validate", async (req, res) =>  {
  const { license, machine } = req.body;
  
  // Kræver både licens og maskine
  if (!license || !machine) return res.json({ Status: "No license entered\nContact: JacobSkovmand@hotmail.com"});

  // Slår licensen op i LicenseTable
  const { data, error } = await supabase
    .from("LicenseTable")
    .select("*")
    .eq("license", license)
    .limit(1);

  if (error) return res.json({ status: "Network issues, please try agian later" });

  const existing = data[0];

  // Licensen findes ikke
  if (!existing) return res.json({ status: "License not found\nContact: JacobSkovmand@hotmail.com" });

  // Licensen er deaktiveret
  if (existing.disabled) return res.json({ status: "License disabled\nContact: JacobSkovmand@hotmail.com" });

  // Udløbsdato-check
  if (existing.expiryDate) {
    const expiry = new Date(existing.expiryDate).getTime();
    if (Date.now() > expiry){
      return res.json({ status: "License expired\nContact: JacobSkovmand@hotmail.com" })};
  }
   console.log(existing.license)
  console.log(existing.machine)
  console.log(existing.trial)
  // Trial-licens → må bruges på flere maskiner
  if (existing.Trial) {
    await logLicenseCheck(license, machine, "Trial");
    // Maskinen er allerede registreret → valid trial
    return res.json({ status: "Trial license registered" });    
  }

  // Normal licens → må kun bruges på én maskine
  if (!existing.trial && !existing.machine) {
    const { error: updateError } = await supabase
      .from("LicenseTable")
      .update({ machine, activationDate: new Date()})
      .eq("license", license);
      await logLicenseCheck(license, machine, "Customer");
    
    if (updateError) return res.json({ status: "update error" });

    return res.json({ status: "Licens registered" });
  }
  
  // Maskinen matcher → valid
  if (existing.machine === machine) {
    await logLicenseCheck(license, machine, "Valid");
    return res.json({ status: "Valid" });
  }

  // Maskinen matcher ikke → invalid
  return res.json({ status: "License is not bought for this PC\nContact: JacobSkovmand@hotmail.com" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

