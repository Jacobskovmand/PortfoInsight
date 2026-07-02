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
async function logLicenseCheck(license, machine, status) {
  try {
    const { data, error } = await supabase
      .from("LicenseChecked")
      .insert([{ license, machine, status }])
      .select();

    if (error) console.error("DB error:", error);
    else console.log("Inserted:", data);
  } catch (err) {
    console.error("Log error:", err);
  }
}

// API-endpoint til licensvalidering
app.post("/validate", async (req, res) => {
  const { license, machine } = req.body;

  
  // Kræver både licens og maskine
  if (!license || !machine) return res.json({ status: "No license entered" \n
                                              message: "Contact JacobSkovmand@hotmail.com"});

  // Slår licensen op i LicenseTable
  const { data, error } = await supabase
    .from("LicenseTable")
    .select("*")
    .eq("license", license)
    .limit(1);

  if (error) return res.json({ status: "Network issues, please try agian later" });

  const existing = data[0];

  // Licensen findes ikke
  if (!existing) return res.json({ status: "License not found" });

  // Licensen er deaktiveret
  if (existing.disabled) return res.json({ status: "License disabled" });

  // Udløbsdato-check
  if (existing.expiryDate) {
    const expiry = new Date(existing.expiryDate);
    if (Date.now() > expiry) return res.json({ status: "License expired" });
  }
  console.log("expiryDate raw:", existing.expiryDate);
  console.log("parsed:", new Date(existing.expiryDate));
  console.log("now:", Date.now());
  console.log("expiry ms:", new Date(existing.expiryDate).getTime());
  
  // Trial-licens → må bruges på flere maskiner
  if (existing.Trial) {
    const { data: trialMachines } = await supabase
      .from("LicenseTable")
      .select("*")
      .eq("license", license)
      .eq("machine", machine);

    // Maskinen er allerede registreret → valid trial
    if (trialMachines.length > 0) return res.json({ status: "Trial license" });

    // Registrér ny maskine til trial-licens
    const { error: insertError } = await supabase
      .from("LicenseTable")
      .insert([{ license, machine, activationDate: new Date() }]);

    if (insertError) return res.json({ status: "error_3" });

    return res.json({ status: "registered" });
  }

  // Normal licens → må kun bruges på én maskine
  if (!existing.machine) {
    const { error: updateError } = await supabase
      .from("LicenseTable")
      .update({ machine, activationDate: new Date() })
      .eq("license", license);

    if (updateError) return res.json({ status: "error_4" });

    return res.json({ status: "Registered" });
  }

  // Maskinen matcher → valid
  if (existing.machine === machine) {
    await logLicenseCheck(license, machine, "Valid");
    return res.json({ status: "Valid" });
  }

  // Maskinen matcher ikke → invalid
  return res.json({ status: "Invalid Machine" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

