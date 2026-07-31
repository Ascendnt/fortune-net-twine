import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/Feedback";
import { Construction } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export function PhasePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP"]}
        title={title}
        description="Scoped for a later delivery horizon — shown here for navigation context only."
      />
      <EmptyState
        icon={<Construction className="h-5 w-5" />}
        title="Not part of this prototype"
        description={note}
        action={
          <Link to="/">
            <Button variant="secondary" size="sm">
              Back to Dashboard
            </Button>
          </Link>
        }
      />
    </div>
  );
}
