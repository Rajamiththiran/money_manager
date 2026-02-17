// File: src/views/CreditCardsView.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CreditCard,
  Plus,
  X,
  DollarSign,
  Calendar,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Settings,
  FileText,
  Eye,
  Trash2,
  Pencil,
} from "lucide-react";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import ProgressBar from "../components/ProgressBar";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { useCurrency } from "../hooks/useCurrency";
import type { AccountWithBalance, AccountGroup } from "../types/account";
import type {
  CreditCardWithDetails,
  CreditCardSettings,
  CreditCardStatement,
  StatementWithTransactions,
  CreateCreditCardSettingsInput,
  UpdateCreditCardSettingsInput,
  SettlementInput,
  BillingCycleInfo,
} from "../types/credit_card";

type Tab = "overview" | "statements" | "configure";

// ═══════════════════════════════════════════════════════════════
// MAIN VIEW
// ═══════════════════════════════════════════════════════════════

export default function CreditCardsView() {
  const { success, error: showError } = useToast();
  const { formatAmount } = useCurrency();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [creditCards, setCreditCards] = useState<CreditCardWithDetails[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Settlement modal
  const [settlementCard, setSettlementCard] =
    useState<CreditCardWithDetails | null>(null);
  const [settlementForm, setSettlementForm] = useState<{
    payment_account_id: number;
    amount: string;
    date: string;
    payFull: boolean;
  }>({
    payment_account_id: 0,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    payFull: true,
  });
  const [settlementSubmitting, setSettlementSubmitting] = useState(false);

  // Configure form
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingSettings, setEditingSettings] =
    useState<CreditCardSettings | null>(null);
  const [configForm, setConfigForm] = useState<CreateCreditCardSettingsInput>({
    account_id: 0,
    credit_limit: 0,
    statement_day: 25,
    payment_due_day: 5,
    minimum_payment_percentage: 5,
    auto_settlement_enabled: false,
    settlement_account_id: undefined,
  });
  const [configSubmitting, setConfigSubmitting] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    settingsId: number | null;
    cardName: string;
  }>({ open: false, settingsId: null, cardName: "" });

  // Statements
  const [selectedCardForStatements, setSelectedCardForStatements] = useState<
    number | null
  >(null);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [expandedStatement, setExpandedStatement] =
    useState<StatementWithTransactions | null>(null);
  const [expandedStatementId, setExpandedStatementId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, accts, groups] = await Promise.all([
        invoke<CreditCardWithDetails[]>("get_all_credit_cards"),
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
        invoke<AccountGroup[]>("get_account_groups"),
      ]);
      setCreditCards(cards);
      setAccounts(accts);
      setAccountGroups(groups);
    } catch (err) {
      showError("Failed to load data", String(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Filter accounts by type for dropdowns
  const liabilityAccounts = accounts.filter((a) => {
    const group = accountGroups.find((g) => g.id === a.group_id);
    return group?.account_type === "LIABILITY";
  });

  const assetAccounts = accounts.filter((a) => {
    const group = accountGroups.find((g) => g.id === a.group_id);
    return group?.account_type === "ASSET";
  });

  // Accounts that don't have credit card settings yet
  const unconfiguredLiabilityAccounts = liabilityAccounts.filter(
    (a) => !creditCards.some((cc) => cc.settings.account_id === a.id),
  );

  // ═══════════════ SETTLEMENT ═══════════════

  const openSettlement = (card: CreditCardWithDetails) => {
    setSettlementCard(card);
    setSettlementForm({
      payment_account_id:
        card.settings.settlement_account_id || assetAccounts[0]?.id || 0,
      amount: card.total_balance.toFixed(2),
      date: new Date().toISOString().split("T")[0],
      payFull: true,
    });
  };

  const handleSettle = async () => {
    if (!settlementCard) return;
    setSettlementSubmitting(true);
    try {
      const input: SettlementInput = {
        credit_card_settings_id: settlementCard.settings.id,
        payment_account_id: settlementForm.payment_account_id,
        amount: settlementForm.payFull
          ? undefined
          : parseFloat(settlementForm.amount),
        date: settlementForm.date,
      };
      await invoke("settle_credit_card", { input });
      success(
        "Payment Recorded",
        `Payment to ${settlementCard.account_name} processed.`,
      );
      setSettlementCard(null);
      await loadData();
    } catch (err) {
      showError("Settlement Failed", String(err));
    } finally {
      setSettlementSubmitting(false);
    }
  };

  // ═══════════════ CONFIGURE ═══════════════

  const handleCreateSettings = async () => {
    setConfigSubmitting(true);
    try {
      await invoke("create_credit_card_settings", { input: configForm });
      success("Card Configured", "Credit card settings saved.");
      setShowConfigForm(false);
      resetConfigForm();
      await loadData();
    } catch (err) {
      showError("Failed to Save", String(err));
    } finally {
      setConfigSubmitting(false);
    }
  };

  const handleUpdateSettings = async () => {
    if (!editingSettings) return;
    setConfigSubmitting(true);
    try {
      const input: UpdateCreditCardSettingsInput = {
        id: editingSettings.id,
        credit_limit: configForm.credit_limit,
        statement_day: configForm.statement_day,
        payment_due_day: configForm.payment_due_day,
        minimum_payment_percentage: configForm.minimum_payment_percentage,
        auto_settlement_enabled: configForm.auto_settlement_enabled,
        settlement_account_id: configForm.settlement_account_id,
      };
      await invoke("update_credit_card_settings", { input });
      success("Settings Updated", "Credit card settings updated.");
      setEditingSettings(null);
      setShowConfigForm(false);
      resetConfigForm();
      await loadData();
    } catch (err) {
      showError("Failed to Update", String(err));
    } finally {
      setConfigSubmitting(false);
    }
  };

  const handleDeleteSettings = async () => {
    if (!deleteConfirm.settingsId) return;
    try {
      await invoke("delete_credit_card_settings", {
        settingsId: deleteConfirm.settingsId,
      });
      success("Deleted", "Credit card settings removed.");
      await loadData();
    } catch (err) {
      showError("Failed to Delete", String(err));
    } finally {
      setDeleteConfirm({ open: false, settingsId: null, cardName: "" });
    }
  };

  const openEditSettings = (card: CreditCardWithDetails) => {
    setEditingSettings(card.settings);
    setConfigForm({
      account_id: card.settings.account_id,
      credit_limit: card.settings.credit_limit,
      statement_day: card.settings.statement_day,
      payment_due_day: card.settings.payment_due_day,
      minimum_payment_percentage: card.settings.minimum_payment_percentage,
      auto_settlement_enabled: card.settings.auto_settlement_enabled,
      settlement_account_id: card.settings.settlement_account_id ?? undefined,
    });
    setShowConfigForm(true);
    setActiveTab("configure");
  };

  const resetConfigForm = () => {
    setConfigForm({
      account_id: unconfiguredLiabilityAccounts[0]?.id || 0,
      credit_limit: 0,
      statement_day: 25,
      payment_due_day: 5,
      minimum_payment_percentage: 5,
      auto_settlement_enabled: false,
      settlement_account_id: undefined,
    });
    setEditingSettings(null);
  };

  // ═══════════════ STATEMENTS ═══════════════

  const loadStatements = async (settingsId: number) => {
    setStatementsLoading(true);
    setExpandedStatement(null);
    setExpandedStatementId(null);
    try {
      const data = await invoke<CreditCardStatement[]>("get_statements", {
        settingsId,
      });
      setStatements(data);
      setSelectedCardForStatements(settingsId);
    } catch (err) {
      showError("Failed to Load Statements", String(err));
    } finally {
      setStatementsLoading(false);
    }
  };

  const loadStatementDetails = async (statementId: number) => {
    if (expandedStatementId === statementId) {
      setExpandedStatementId(null);
      setExpandedStatement(null);
      return;
    }
    try {
      const data = await invoke<StatementWithTransactions>(
        "get_statement_with_transactions",
        { statementId },
      );
      setExpandedStatement(data);
      setExpandedStatementId(statementId);
    } catch (err) {
      showError("Failed to Load Details", String(err));
    }
  };

  const generateStatement = async (settingsId: number) => {
    try {
      await invoke("generate_statement", { settingsId });
      success("Statement Generated", "New billing statement created.");
      await loadStatements(settingsId);
    } catch (err) {
      showError("Failed to Generate", String(err));
    }
  };

  // ═══════════════ TABS ═══════════════

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: CreditCard },
    { id: "statements", label: "Statements", icon: FileText },
    { id: "configure", label: "Configure", icon: Settings },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Credit Cards
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Manage your credit cards, payments, and statements
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading credit cards...
          </p>
        </div>
      ) : (
        <>
          {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
          {activeTab === "overview" && (
            <OverviewTab
              creditCards={creditCards}
              formatAmount={formatAmount}
              onSettle={openSettlement}
              onEdit={openEditSettings}
              onViewStatements={(settingsId) => {
                setSelectedCardForStatements(settingsId);
                loadStatements(settingsId);
                setActiveTab("statements");
              }}
            />
          )}

          {/* ═══════════════ STATEMENTS TAB ═══════════════ */}
          {activeTab === "statements" && (
            <StatementsTab
              creditCards={creditCards}
              selectedCardId={selectedCardForStatements}
              statements={statements}
              statementsLoading={statementsLoading}
              expandedStatementId={expandedStatementId}
              expandedStatement={expandedStatement}
              formatAmount={formatAmount}
              onSelectCard={loadStatements}
              onToggleStatement={loadStatementDetails}
              onGenerateStatement={generateStatement}
            />
          )}

          {/* ═══════════════ CONFIGURE TAB ═══════════════ */}
          {activeTab === "configure" && (
            <ConfigureTab
              creditCards={creditCards}
              unconfiguredAccounts={unconfiguredLiabilityAccounts}
              assetAccounts={assetAccounts}
              showForm={showConfigForm}
              editingSettings={editingSettings}
              configForm={configForm}
              configSubmitting={configSubmitting}
              formatAmount={formatAmount}
              onToggleForm={() => {
                if (showConfigForm) {
                  resetConfigForm();
                } else {
                  resetConfigForm();
                }
                setShowConfigForm(!showConfigForm);
              }}
              onConfigChange={setConfigForm}
              onSubmit={
                editingSettings ? handleUpdateSettings : handleCreateSettings
              }
              onEdit={openEditSettings}
              onDelete={(id, name) =>
                setDeleteConfirm({ open: true, settingsId: id, cardName: name })
              }
            />
          )}
        </>
      )}

      {/* ═══════════════ SETTLEMENT MODAL ═══════════════ */}
      {settlementCard && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSettlementCard(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Make Payment
              </h2>
              <button
                onClick={() => setSettlementCard(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Paying
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {settlementCard.account_name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Outstanding: {formatAmount(settlementCard.total_balance)}
                </p>
              </div>

              <Select
                label="Pay From"
                value={settlementForm.payment_account_id}
                onChange={(e) =>
                  setSettlementForm({
                    ...settlementForm,
                    payment_account_id: parseInt(e.target.value),
                  })
                }
                options={assetAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${formatAmount(a.current_balance)})`,
                }))}
              />

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settlementForm.payFull}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        payFull: e.target.checked,
                        amount: e.target.checked
                          ? settlementCard.total_balance.toFixed(2)
                          : settlementForm.amount,
                      })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Pay full balance (
                    {formatAmount(settlementCard.total_balance)})
                  </span>
                </label>
                {!settlementForm.payFull && (
                  <Input
                    label="Payment Amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={settlementForm.amount}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        amount: e.target.value,
                      })
                    }
                  />
                )}
              </div>

              <Input
                label="Payment Date"
                type="date"
                value={settlementForm.date}
                onChange={(e) =>
                  setSettlementForm({
                    ...settlementForm,
                    date: e.target.value,
                  })
                }
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setSettlementCard(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSettle}
                disabled={
                  settlementSubmitting ||
                  settlementForm.payment_account_id === 0 ||
                  (!settlementForm.payFull &&
                    (parseFloat(settlementForm.amount) <= 0 ||
                      isNaN(parseFloat(settlementForm.amount))))
                }
              >
                {settlementSubmitting ? "Processing..." : "Pay Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Credit Card Settings"
        message={`Are you sure you want to remove settings for "${deleteConfirm.cardName}"? This will not delete the account itself.`}
        confirmLabel="Delete Settings"
        onConfirm={handleDeleteSettings}
        onCancel={() =>
          setDeleteConfirm({ open: false, settingsId: null, cardName: "" })
        }
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════

function OverviewTab({
  creditCards,
  formatAmount,
  onSettle,
  onEdit,
  onViewStatements,
}: {
  creditCards: CreditCardWithDetails[];
  formatAmount: (v: number, s?: boolean) => string;
  onSettle: (card: CreditCardWithDetails) => void;
  onEdit: (card: CreditCardWithDetails) => void;
  onViewStatements: (settingsId: number) => void;
}) {
  if (creditCards.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <CreditCard className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Credit Cards Configured
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Go to the Configure tab to set up credit card settings for your
          liability accounts.
        </p>
      </div>
    );
  }

  // Summary stats
  const totalBalance = creditCards.reduce((s, c) => s + c.total_balance, 0);
  const totalLimit = creditCards.reduce(
    (s, c) => s + c.settings.credit_limit,
    0,
  );
  const totalAvailable = creditCards.reduce(
    (s, c) => s + c.available_credit,
    0,
  );
  const overallUtilization =
    totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Balance"
          value={formatAmount(totalBalance)}
          color="red"
        />
        <SummaryCard
          label="Total Limit"
          value={formatAmount(totalLimit)}
          color="blue"
        />
        <SummaryCard
          label="Available Credit"
          value={formatAmount(totalAvailable)}
          color="green"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Overall Utilization
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 mb-3">
            {overallUtilization.toFixed(1)}%
          </p>
          <ProgressBar
            percentage={overallUtilization}
            showLabel={false}
            height="sm"
          />
        </div>
      </div>

      {/* Card List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {creditCards.map((card) => (
          <CreditCardCard
            key={card.settings.id}
            card={card}
            formatAmount={formatAmount}
            onSettle={() => onSettle(card)}
            onEdit={() => onEdit(card)}
            onViewStatements={() => onViewStatements(card.settings.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREDIT CARD CARD
// ═══════════════════════════════════════════════════════════════

function CreditCardCard({
  card,
  formatAmount,
  onSettle,
  onEdit,
  onViewStatements,
}: {
  card: CreditCardWithDetails;
  formatAmount: (v: number, s?: boolean) => string;
  onSettle: () => void;
  onEdit: () => void;
  onViewStatements: () => void;
}) {
  const [cycle, setCycle] = useState<BillingCycleInfo | null>(null);

  useEffect(() => {
    invoke<BillingCycleInfo>("get_current_billing_cycle", {
      settingsId: card.settings.id,
    })
      .then(setCycle)
      .catch(() => {});
  }, [card.settings.id]);

  const utilizationColor =
    card.utilization_percentage >= 90
      ? "text-red-600 dark:text-red-400"
      : card.utilization_percentage >= 70
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-green-600 dark:text-green-400";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Card Header */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {card.account_name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Limit: {formatAmount(card.settings.credit_limit)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Edit settings"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Balance Info */}
      <div className="p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current Balance
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatAmount(card.total_balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Available
            </p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatAmount(card.available_credit)}
            </p>
          </div>
        </div>

        {/* Utilization */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Utilization
            </span>
            <span className={`text-xs font-medium ${utilizationColor}`}>
              {card.utilization_percentage.toFixed(1)}%
            </span>
          </div>
          <ProgressBar
            percentage={card.utilization_percentage}
            showLabel={false}
            height="sm"
          />
        </div>

        {/* Cycle Info */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-700/50">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current Cycle Charges
            </p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {formatAmount(card.current_cycle_charges)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current Cycle Payments
            </p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {formatAmount(card.current_cycle_payments)}
            </p>
          </div>
          {cycle && (
            <>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Payment Due
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(cycle.due_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Days Remaining
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {cycle.days_remaining} days
                </p>
              </div>
            </>
          )}
        </div>

        {/* Settlement account */}
        {card.settlement_account_name && (
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700/50">
            Auto-pay from: {card.settlement_account_name}
            {card.settings.auto_settlement_enabled && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium">
                AUTO
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/20 flex gap-2">
        <Button
          size="sm"
          onClick={onSettle}
          disabled={card.total_balance <= 0}
          icon={<DollarSign className="w-3.5 h-3.5" />}
        >
          Make Payment
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onViewStatements}
          icon={<FileText className="w-3.5 h-3.5" />}
        >
          Statements
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STATEMENTS TAB
// ═══════════════════════════════════════════════════════════════

function StatementsTab({
  creditCards,
  selectedCardId,
  statements,
  statementsLoading,
  expandedStatementId,
  expandedStatement,
  formatAmount,
  onSelectCard,
  onToggleStatement,
  onGenerateStatement,
}: {
  creditCards: CreditCardWithDetails[];
  selectedCardId: number | null;
  statements: CreditCardStatement[];
  statementsLoading: boolean;
  expandedStatementId: number | null;
  expandedStatement: StatementWithTransactions | null;
  formatAmount: (v: number, s?: boolean) => string;
  onSelectCard: (id: number) => void;
  onToggleStatement: (id: number) => void;
  onGenerateStatement: (settingsId: number) => void;
}) {
  if (creditCards.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          No credit cards configured yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Card Selector */}
      <div className="flex items-center gap-4">
        <Select
          label="Select Credit Card"
          value={selectedCardId ?? ""}
          onChange={(e) => onSelectCard(parseInt(e.target.value))}
          options={creditCards.map((c) => ({
            value: c.settings.id,
            label: c.account_name,
          }))}
        />
        {selectedCardId && (
          <div className="pt-6">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onGenerateStatement(selectedCardId)}
              icon={<FileText className="w-3.5 h-3.5" />}
            >
              Generate Statement
            </Button>
          </div>
        )}
      </div>

      {/* Statements List */}
      {statementsLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : !selectedCardId ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">
            Select a credit card to view its statements.
          </p>
        </div>
      ) : statements.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FileText className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No statements generated yet.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Click "Generate Statement" to create one for the current cycle.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {statements.map((stmt) => (
            <div
              key={stmt.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Statement Header */}
              <button
                onClick={() => onToggleStatement(stmt.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {new Date(stmt.statement_date).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long", day: "numeric" },
                      )}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(stmt.cycle_start_date).toLocaleDateString()} –{" "}
                      {new Date(stmt.cycle_end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatAmount(stmt.closing_balance)}
                    </p>
                    <StatementStatusBadge status={stmt.status} />
                  </div>
                  {expandedStatementId === stmt.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedStatementId === stmt.id && expandedStatement && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-gray-50 dark:bg-gray-700/20">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Opening Balance
                      </p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatAmount(
                          expandedStatement.statement.opening_balance,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Total Charges
                      </p>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {formatAmount(
                          expandedStatement.statement.total_charges,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Total Payments
                      </p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatAmount(
                          expandedStatement.statement.total_payments,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Minimum Payment
                      </p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatAmount(
                          expandedStatement.statement.minimum_payment,
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Transactions */}
                  {expandedStatement.transactions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Date
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Type
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Category
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Memo
                            </th>
                            <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {expandedStatement.transactions.map((txn) => (
                            <tr
                              key={txn.id}
                              className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20"
                            >
                              <td className="px-5 py-3 text-gray-900 dark:text-white">
                                {new Date(txn.date).toLocaleDateString()}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    txn.transaction_type === "EXPENSE"
                                      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                      : txn.transaction_type === "INCOME"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                  }`}
                                >
                                  {txn.transaction_type}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                                {txn.category_name || "—"}
                              </td>
                              <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                                {txn.memo || "—"}
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-white">
                                {formatAmount(txn.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center text-sm text-gray-500 dark:text-gray-400">
                      No transactions in this billing cycle.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURE TAB
// ═══════════════════════════════════════════════════════════════

function ConfigureTab({
  creditCards,
  unconfiguredAccounts,
  assetAccounts,
  showForm,
  editingSettings,
  configForm,
  configSubmitting,
  formatAmount,
  onToggleForm,
  onConfigChange,
  onSubmit,
  onEdit,
  onDelete,
}: {
  creditCards: CreditCardWithDetails[];
  unconfiguredAccounts: AccountWithBalance[];
  assetAccounts: AccountWithBalance[];
  showForm: boolean;
  editingSettings: CreditCardSettings | null;
  configForm: CreateCreditCardSettingsInput;
  configSubmitting: boolean;
  formatAmount: (v: number, s?: boolean) => string;
  onToggleForm: () => void;
  onConfigChange: (form: CreateCreditCardSettingsInput) => void;
  onSubmit: () => void;
  onEdit: (card: CreditCardWithDetails) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const canCreate = unconfiguredAccounts.length > 0;

  return (
    <div className="space-y-6">
      {/* New Card Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Credit Card Settings
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure credit limits, billing cycles, and auto-payment for your
            credit card accounts
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={onToggleForm}
            icon={
              showForm ? (
                <X className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )
            }
            variant={showForm ? "secondary" : "primary"}
          >
            {showForm
              ? "Cancel"
              : editingSettings
                ? "Cancel Edit"
                : "Configure Card"}
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingSettings ? "Edit Card Settings" : "Configure Credit Card"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!editingSettings && (
              <Select
                label="Credit Card Account"
                value={configForm.account_id}
                onChange={(e) =>
                  onConfigChange({
                    ...configForm,
                    account_id: parseInt(e.target.value),
                  })
                }
                options={unconfiguredAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
                required
              />
            )}
            {editingSettings && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Credit Card Account
                </label>
                <p className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm">
                  {creditCards.find((c) => c.settings.id === editingSettings.id)
                    ?.account_name || "Unknown"}
                </p>
              </div>
            )}
            <Input
              label="Credit Limit"
              type="number"
              step="0.01"
              min="0"
              value={configForm.credit_limit}
              onChange={(e) =>
                onConfigChange({
                  ...configForm,
                  credit_limit: parseFloat(e.target.value) || 0,
                })
              }
              required
            />
            <Input
              label="Statement Day (1-28)"
              type="number"
              min="1"
              max="28"
              value={configForm.statement_day}
              onChange={(e) =>
                onConfigChange({
                  ...configForm,
                  statement_day: parseInt(e.target.value) || 25,
                })
              }
              required
            />
            <Input
              label="Payment Due Day (1-28)"
              type="number"
              min="1"
              max="28"
              value={configForm.payment_due_day}
              onChange={(e) =>
                onConfigChange({
                  ...configForm,
                  payment_due_day: parseInt(e.target.value) || 5,
                })
              }
              required
            />
            <Input
              label="Minimum Payment %"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={configForm.minimum_payment_percentage}
              onChange={(e) =>
                onConfigChange({
                  ...configForm,
                  minimum_payment_percentage: parseFloat(e.target.value) || 5,
                })
              }
            />
            <Select
              label="Settlement Account (optional)"
              value={configForm.settlement_account_id ?? ""}
              onChange={(e) =>
                onConfigChange({
                  ...configForm,
                  settlement_account_id: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                })
              }
              options={[
                { value: "", label: "None" },
                ...assetAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${formatAmount(a.current_balance)})`,
                })),
              ]}
            />
            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configForm.auto_settlement_enabled}
                  onChange={(e) =>
                    onConfigChange({
                      ...configForm,
                      auto_settlement_enabled: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enable auto-settlement
                </span>
              </label>
            </div>
          </div>
          <div className="mt-6">
            <Button
              onClick={onSubmit}
              disabled={configSubmitting || configForm.credit_limit <= 0}
              fullWidth
            >
              {configSubmitting
                ? "Saving..."
                : editingSettings
                  ? "Update Settings"
                  : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* Existing Cards Table */}
      {creditCards.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Settings className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No credit cards configured.
            {canCreate
              ? ' Click "Configure Card" to get started.'
              : " Create a liability account first in the Accounts view."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Card
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Limit
                </th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Statement Day
                </th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Due Day
                </th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Auto-Pay
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {creditCards.map((card) => (
                <tr
                  key={card.settings.id}
                  className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-4 w-4 text-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {card.account_name}
                        </p>
                        {card.settlement_account_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Pays from: {card.settlement_account_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white">
                    {formatAmount(card.settings.credit_limit)}
                  </td>
                  <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-400">
                    {card.settings.statement_day}
                  </td>
                  <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-400">
                    {card.settings.payment_due_day}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {card.settings.auto_settlement_enabled ? (
                      <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                        ON
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium">
                        OFF
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(card)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          onDelete(card.settings.id, card.account_name)
                        }
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "red" | "blue" | "green" | "purple";
}) {
  const colorClasses = {
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorClasses[color]}`}>
        {value}
      </p>
    </div>
  );
}

function StatementStatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    CLOSED:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    PAID: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    PARTIAL:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${config[status] || config.OPEN}`}
    >
      {status}
    </span>
  );
}
