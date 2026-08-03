import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CUSTOMERS } from "@/lib/mockData";
import { formatMoney, formatDate, initials } from "@/lib/format";
import type { Customer } from "@/lib/types";

export function CustomersList() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const navigate = useNavigate();

  const filtered = CUSTOMERS.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.country.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Customer Master"
        title="Customers"
        description="Company profiles, default terms, and outstanding balances."
      />

      <div className="mb-4 relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer or country…"
          className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </div>

      <Table>
        <THead>
          <TH>Customer</TH>
          <TH>Country</TH>
          <TH>Default Terms</TH>
          <TH>Total Orders</TH>
          <TH>Total Value</TH>
          <TH>Outstanding</TH>
        </THead>
        <tbody>
          {filtered.map((c) => (
            <TR key={c.id} onClick={() => setSelected(c)}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine-100 font-mono text-[11px] font-semibold text-pine-700">
                    {initials(c.name)}
                  </div>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-paper-400">{c.contactPerson}</p>
                  </div>
                </div>
              </TD>
              <TD>{c.country}</TD>
              <TD className="text-xs">{c.defaultPaymentTerms}</TD>
              <TD className="font-mono">{c.totalOrders}</TD>
              <TD className="font-mono font-medium">{formatMoney(c.totalValueUSD)}</TD>
              <TD className={`font-mono font-medium ${c.outstandingBalanceUSD > 0 ? "text-alert-600" : "text-pine-600"}`}>
                {formatMoney(c.outstandingBalanceUSD)}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected?.country}
        footer={
          selected && (
            <Button variant="primary" size="sm" onClick={() => navigate("/quotations/new")}>
              New Quotation for this Customer
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <Card padded={false} className="border-0 shadow-none">
              <KeyValue label="Consignee" value={selected.consignee} />
              <KeyValue label="Address" value={<span className="text-right">{selected.address}</span>} />
              <KeyValue label="Contact person" value={selected.contactPerson} />
              <KeyValue
                label="Email"
                value={
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {selected.email}
                  </span>
                }
              />
              <KeyValue
                label="Phone"
                value={
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selected.phone}
                  </span>
                }
              />
              <div className="my-2 border-t border-paper-100" />
              <KeyValue label="Default payment terms" value={selected.defaultPaymentTerms} />
              <KeyValue label="Default currency" value={selected.defaultCurrency} />
              <KeyValue label="Customer since" value={formatDate(selected.since)} />
              <KeyValue label="Agent" value={selected.agent ?? "—"} />
              <KeyValue
                label="Issuing entity"
                value={
                  selected.letterhead === "NETTEX MFG. AND EXPORT CORP."
                    ? "Nettex Mfg. and Export Corp."
                    : "Fortune Net & Twine Manufacturing Corp."
                }
              />
              <div className="my-2 border-t border-paper-100" />
              <KeyValue label="Total orders" value={String(selected.totalOrders)} />
              <KeyValue label="Total value" value={formatMoney(selected.totalValueUSD)} mono />
              <KeyValue label="Outstanding balance" value={formatMoney(selected.outstandingBalanceUSD)} mono />
            </Card>
          </div>
        )}
      </Modal>

      {filtered.length === 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-paper-400">
          <Users className="h-4 w-4" /> No customers match your search.
        </div>
      )}
    </div>
  );
}
