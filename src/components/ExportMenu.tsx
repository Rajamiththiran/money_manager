// File: src/components/ExportMenu.tsx
import { useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import type { TransactionWithDetails } from "../types/transaction";

interface ExportMenuProps {
  transactions: TransactionWithDetails[];
}

export default function ExportMenu({ transactions }: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    setIsExporting(true);

    try {
      // CSV Header
      const headers = [
        "Date",
        "Type",
        "Account",
        "To Account",
        "Category",
        "Amount",
        "Memo",
      ];

      // CSV Rows
      const rows = transactions.map((txn) => [
        txn.date,
        txn.transaction_type,
        txn.account_name,
        txn.to_account_name || "",
        txn.category_name || "",
        txn.amount.toFixed(2),
        (txn.memo || "").replace(/"/g, '""'), // Escape quotes
      ]);

      // Build CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `transactions_${new Date().toISOString().split("T")[0]}.csv`,
      );
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to export CSV:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToJSON = () => {
    setIsExporting(true);

    try {
      const jsonContent = JSON.stringify(transactions, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `transactions_${new Date().toISOString().split("T")[0]}.json`,
      );
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to export JSON:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={exportToCSV}
          disabled={isExporting || transactions.length === 0}
          icon={<ArrowDownTrayIcon className="h-4 w-4" />}
        >
          Export CSV
        </Button>
        <Button
          variant="ghost"
          onClick={exportToJSON}
          disabled={isExporting || transactions.length === 0}
        >
          JSON
        </Button>
      </div>
    </div>
  );
}
