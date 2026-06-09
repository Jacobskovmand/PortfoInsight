const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// Railway miljøvariabler
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.post("/validate", async (req, res) => {
  const { license, machine } = req.body;

  if (!license || !machine) {
    return res.json({ status: "error" });
  }

  // 1. Find licensen i activations-tabellen
  const { data, error } = await supabase
    .from("activations")
    .select("*")
    .eq("license", license)
    .limit(1);

  if (error) {
    console.log("Select error:", error);
    return res.json({ status: "error" });
  }

  const existing = data[0];

  // 2. Licensen findes ikke
  if (!existing) {
    return res.json({ status: "license_not_found" });
  }

  // 3. Licensen er disabled
  if (existing.disabled === true) {
    return res.json({ status: "disabled" });
  }

  // 4. Trial-licens udløbet?
  if (existing.Trial === true) {
    const today = new Date();
    const expiry = new Date(existing.ExpiryDate);

    if (today > expiry) {
      return res.json({ status: "trial_expired" });
    }
  }

  // 5. Trial-licens må bruges på flere maskiner
  if (existing.Trial === true) {
    // Tjek om maskinen allerede findes
    const { data: trialMachines } = await supabase
      .from("activations")
      .select("*")
      .eq("license", license)
      .eq("machine", machine);

    if (trialMachines.length > 0) {
      return res.json({ status: "valid" });
    }

    // Ellers registrér maskinen
    const { error: insertError } = await supabase
      .from("activations")
      .insert([{ license, machine }]);

    if (insertError) {
      console.log("Insert error:", insertError);
      return res.json({ status: "error" });
    }

    return res.json({ status: "registered" });
  }

  // 6. Normal licens → kun én maskine
  if (!existing.machine || existing.machine === "") {
    const { error: updateError } = await supabase
      .from("activations")
      .update({ machine })
      .eq("license", license);

    if (updateError) {
      console.log("Update error:", updateError);
      return res.json({ status: "error" });
    }

    return res.json({ status: "registered" });
  }

  // 7. Maskinen matcher → valid
  if (existing.machine === machine) {
    return res.json({ status: "valid" });
  }

  // 8. Maskinen matcher ikke → invalid
  return res.json({ status: "invalid_machine" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
