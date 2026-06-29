const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const today = new Date();
const app = express();
app.use(express.json());

// Railway miljøvariabler
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Hjælpefunktion
async function logLicenseCheck(license, machine, status) {
  const { error } = await supabase
    .from("LicenseChecked")
    .insert([{
      license,
      machine,
      status,
      checkedAt: new Date()
    }]);

  if (error) {
    console.error("LicenseChecked insert error:", error);
  }
}
app.post("/validate", async (req, res) => {
  const { license, machine } = req.body;

  if (!license || !machine) {
    return res.json({ status: "No license entered" });
  }

  // 1. Find licensen i LicenseTable-tabellen
  const { data, error } = await supabase
    .from("LicenseTable")
    .select("*")
    .eq("license", license)
    .limit(1);

  if (error) {
    console.log("Select error:", error);
    return res.json({ status: "error_2" });
  }

  const existing = data[0];

  // 2. Licensen findes ikke
  if (!existing) {
    return res.json({ status: "License not found" });
  }

  // 3. Licensen er disabled
  if (existing.disabled === true) {
    return res.json({ status: "License disabled" });
  }

  // 4. License Expired?  
  if(existing.expiryDate) { 
    const expiry = new Date(existing.ExpiryDate);
    if (today > expiry) {
      return res.json({ status: "License expired" });
    }
    }
  
  // 5. Trial-licens må bruges på flere maskiner
  if (existing.Trial === true) {
    // Tjek om maskinen allerede findes
    const { data: trialMachines } = await supabase
      .from("LicenseTable")
      .select("*")
      .eq("license", license)
      .eq("machine", machine);
      
    if (trialMachines.length > 0) {
      return res.json({ status: "valid" });
    }

    // Ellers registrér maskinen
    const { error: insertError } = await supabase
      .from("LicenseTable")
      .insert([{ license, machine, activationDate: today }]);

    if (insertError) {
      console.log("Insert error:", insertError);
      return res.json({ status: "error_3" });
    }

    return res.json({ status: "registered" });
  }

  // 6. Normal licens → kun én maskine
  if (!existing.machine || existing.machine === "") {
    const { error: updateError } = await supabase
      .from("LicenseTable")
      .update({ machine, activationDate: today })
      .eq("license", license);

    if (updateError) {
      console.log("Update error:", updateError);
      return res.json({ status: "error_4" });
    }

    return res.json({ status: "Registered" });
  }

  // 7. Maskinen matcher → valid
  if (existing.machine === machine) {
    await logLicenseCheck(license, machine, "Valid");
    return res.json({ status: "Valid" });
  }

  // 8. Maskinen matcher ikke → invalid
  return res.json({ status: "Invalid Machine" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
