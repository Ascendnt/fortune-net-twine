import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { ROLES } from "@/lib/mockData";

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "System"]}
        eyebrow="Configuration"
        title="Settings"
        description="Prototype-level configuration only — full role permissions and business rules ship with Phase 1."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company Profile" eyebrow="Static" />
          <KeyValue label="Legal name" value="Fortune Net & Twine Manufacturing Corp." />
          <KeyValue label="Plant" value="70 D. Bonifacio St., Bo. Canumay, Valenzuela" />
          <KeyValue label="Office" value="42 Sto. Domingo St., Quezon City" />
          <KeyValue label="Default Incoterm" value="FOB Manila" />
          <KeyValue label="Base currency" value="USD" />
        </Card>

        <Card>
          <CardHeader title="Roles in this Prototype" eyebrow="Demonstration only" />
          <div className="space-y-2">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-paper-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-paper-800">{r.label}</p>
                  <p className="text-xs text-paper-400">{r.description}</p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] text-paper-400 border border-paper-200">
                  {r.department}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <ProcessDiscoveryNote
          items={[
            "Real authentication, SSO, and per-role permission enforcement are not part of this prototype — the role switcher only changes what's visible for demonstration.",
            "Configurable business rules (deposit %, approval thresholds, discount limits) will move here once confirmed during discovery.",
          ]}
        />
      </div>
    </div>
  );
}
