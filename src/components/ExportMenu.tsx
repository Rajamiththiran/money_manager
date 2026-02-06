// File: src/components/ExportMenu.tsx
import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
  DocumentTextIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";
import Button from "./Button";
import ExportDialog from "./ExportDialog";

interface ExportFilter {
  start_date?: string;
  end_date?: string;
  transaction_type?: string;
  account_id?: number;
  category_id?: number;
}

interface ExportMenuProps {
  filters?: ExportFilter;
}

export default function ExportMenu({ filters }: ExportMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "json" | "backup">(
    "csv",
  );

  const openExportDialog = (type: "csv" | "json" | "backup") => {
    setExportType(type);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => openExportDialog("csv")}
          icon={<DocumentTextIcon className="h-4 w-4" />}
        >
          Export CSV
        </Button>
        <Button
          variant="ghost"
          onClick={() => openExportDialog("json")}
          icon={<CodeBracketIcon className="h-4 w-4" />}
        >
          JSON
        </Button>
        <Button
          variant="ghost"
          onClick={() => openExportDialog("backup")}
          icon={<ArchiveBoxIcon className="h-4 w-4" />}
        >
          Full Backup
        </Button>
      </div>

      <ExportDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        exportType={exportType}
        filters={filters}
      />
    </>
  );
}
