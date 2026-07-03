// supabase/functions/validate/index.ts

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Miljøvariabler fra Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTACT = Deno.env.get("CONTACT_EMAIL") ?? "JacobSkovmand@hotmail.com";

// Supabase klient (service role)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Logging funktion
async function logLicenseCheck(license: string, machine: string, status: string) {
  try {
    const { error } = await supabase
      .from("LicenseChecked")
      .insert([{ license, machine, status }]);

    if (error) console.error("DB error:", error);
  } catch (err) {
    console.error("Log error:", err);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ status: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const license = body.license;
    const machine = body.machine;

    if (!license || !machine) {
      return new Response(
        JSON.stringify({
          status: `No license entered\nContact: ${CONTACT}`,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Slå licensen op
    const { data, error } = await supabase
      .from("LicenseTable")
      .select("*")
      .eq("license", license)
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({
          status: "Network issues, please try again later",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const existing = data;

    if (!existing) {
      return new Response(
        JSON.stringify({
          status: `License not found\nContact: ${CONTACT}`,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (existing.disabled) {
      return new Response(
        JSON.stringify({
          status: `License disabled\nContact: ${CONTACT}`,
        }),
        { headers: { "Content-Type": "Content-Type: application/json" } },
      );
    }

    // Udløbsdato
    if (existing.expiryDate) {
      const expiry = new Date(existing.expiryDate).getTime();
      if (Date.now() > expiry) {
        return new Response(
          JSON.stringify({
            status: `License expired\nContact: ${CONTACT}`,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Trial licens
    if (existing.trial) {
      await logLicenseCheck(license, machine, "Trial");
      return new Response(
        JSON.stringify({ status: "Trial license registered" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Normal licens uden maskine
    if (!existing.trial && !existing.machine) {
      const { error: updateError } = await supabase
        .from("LicenseTable")
        .update({ machine, activationDate: new Date().toISOString() })
        .eq("license", license);

      await logLicenseCheck(license, machine, "Customer");

      if (updateError) {
        return new Response(
          JSON.stringify({
            status: `Update error\nContact: ${CONTACT}`,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ status: "License registered" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Maskinen matcher
    if (existing.machine === machine) {
      await logLicenseCheck(license, machine, "Valid");
      return new Response(
        JSON.stringify({ status: "Valid" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Maskinen matcher ikke
    return new Response(
      JSON.stringify({
        status: `License is not bought for this PC\nContact: ${CONTACT}`,
      }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({
        status: `Internal error\nContact: ${CONTACT}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
