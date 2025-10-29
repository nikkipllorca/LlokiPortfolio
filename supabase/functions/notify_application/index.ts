// supabase/functions/notify_application/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL")!;
const SENDER_NAME = Deno.env.get("SENDER_NAME")!;



// TEMP: sanity-check what the function sees at runtime
console.log(
  "BREVO_API_KEY prefix:",
  (Deno.env.get("BREVO_API_KEY") || "").slice(0, 8),
  " len:",
  (Deno.env.get("BREVO_API_KEY") || "").length
);



function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sendBrevoEmail(toEmail: string, toName: string, subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text}`);
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const { application_id } = await req.json().catch(() => ({}));
    if (!application_id) return json({ error: "application_id required" }, 400);

    const supabase = createClient(SB_URL, SERVICE_ROLE_KEY);

    // Pull application + job + employer + candidate basics
    const { data: app, error } = await supabase
      .from("applications")
      .select(
        `
        id, created_at, resume_url, profile_json, candidate_id,
        job:job_id (
          id, title,
          employer:employer_id ( id, org_name )
        )
      `
      )
      .eq("id", application_id)
      .single();
    if (error || !app) return json({ error: error?.message || "Not found" }, 404);

    // Employer contact (from profiles.email)
    const { data: employerProfile } = await supabase
      .from("profiles")
      .select("id,name,email")
      .eq("id", app.job.employer.id)
      .single();

    // Candidate profile (optional; for name/email in email body)
    const { data: candProfile } = await supabase
      .from("profiles")
      .select("id,name,email")
      .eq("id", app.candidate_id)
      .single();

    // Send email only if the employer has a valid email on file
    if (employerProfile?.email) {
      const candidateName = candProfile?.name ?? "Candidate";
      const candidateEmail = candProfile?.email ?? "(none)";

      const subject = `New application for ${app.job.title} – from ${candidateName}`;
      const html = `
        <h2>New application received</h2>
        <p><strong>Role:</strong> ${app.job.title}</p>
        <p><strong>Employer:</strong> ${app.job.employer.org_name}</p>
        <p><strong>Submitted:</strong> ${new Date(app.created_at).toLocaleString()}</p>
        <p><strong>Candidate:</strong> ${candidateName} (${candidateEmail})</p>
        ${app.resume_url ? `<p><strong>Resume (PDF):</strong> <a href="${app.resume_url}">${app.resume_url}</a></p>` : ""}
        <p><strong>Snapshot:</strong></p>
        <pre style="background:#111;color:#eee;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:ui-monospace,monospace;">${JSON
          .stringify(app.profile_json, null, 2)
          .replace(/</g, "&lt;")}</pre>
      `;

      try {
        await sendBrevoEmail(
          employerProfile.email,
          employerProfile.name || "Hiring Manager",
          subject,
          html
        );
      } catch (e) {
        // Return success with a warning if email send fails (keeps DB call green)
        return json({ ok: true, application: app, email: { ok: false, error: String(e) } });
      }
      return json({ ok: true, application: app, email: { ok: true } });
    }

    // No employer email on file — still return success for the app payload
    return json({ ok: true, application: app, email: { ok: false, error: "No employer email" } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
