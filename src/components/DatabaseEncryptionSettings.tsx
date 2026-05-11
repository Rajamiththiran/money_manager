import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, Shield, AlertTriangle, Key, Trash2, Eye, EyeOff, CheckCircle2, Circle, XCircle } from "lucide-react";
import Button from "./Button";
import { useToast } from "./Toast";

export default function DatabaseEncryptionSettings() {
  const { success, error: showError } = useToast();
  
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showRemoveEncryption, setShowRemoveEncryption] = useState(false);
  
  // Show/Hide Password States
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkEncryptionStatus();
  }, []);

  const checkEncryptionStatus = async () => {
    try {
      const status = await invoke<{ db_encrypted: boolean }>("get_security_status");
      setIsEncrypted(status.db_encrypted);
    } catch (err) {
      console.error("Failed to check encryption status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFormError(null);
    setShowSetPassword(false);
    setShowChangePassword(false);
    setShowRemoveEncryption(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  // --- Validation Logic ---
  const isPasswordActive = newPassword.length > 0;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecialChar = /[^A-Za-z0-9_.-]/.test(newPassword); // Excludes _, ., - and alphanumeric
  const hasMinLength = newPassword.length >= 8;

  const calculateStrength = () => {
    if (!isPasswordActive) return { label: "", color: "bg-gray-200 dark:bg-gray-700", width: "w-0", textColor: "" };
    
    let score = 0;
    if (hasUppercase) score++;
    if (hasLowercase) score++;
    if (hasNumber) score++;
    if (hasSpecialChar) score++;
    if (hasMinLength) score++;

    if (score <= 2) return { label: "Weak", color: "bg-red-500", width: "w-1/3", textColor: "text-red-500" };
    if (score <= 4) return { label: "Medium", color: "bg-amber-500", width: "w-2/3", textColor: "text-amber-500" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full", textColor: "text-emerald-500" };
  };

  const strength = calculateStrength();
  const isConfirmActive = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  // Render helper for validation item
  const ValidationItem = ({ isValid, label }: { isValid: boolean, label: string }) => {
    let iconColor = "text-gray-300 dark:text-gray-600";
    let textColor = "text-gray-400 dark:text-gray-500";
    let Icon = Circle;

    if (isPasswordActive) {
      if (isValid) {
        iconColor = "text-emerald-500";
        textColor = "text-gray-700 dark:text-gray-200";
        Icon = CheckCircle2;
      } else {
        iconColor = "text-red-400";
        textColor = "text-red-400";
        Icon = XCircle;
      }
    }

    return (
      <div className="flex items-center gap-2 text-sm transition-colors duration-200">
        <Icon className={`w-4 h-4 transition-all duration-300 ${iconColor}`} />
        <span className={`transition-colors duration-300 ${textColor}`}>
          {label}
        </span>
      </div>
    );
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke("set_master_password", { password: newPassword });
      setIsEncrypted(true);
      success("Database Encrypted", "Your database is now encrypted at rest.");
      resetForm();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentPassword) {
      setFormError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke("change_master_password", {
        currentPassword,
        newPassword,
      });
      success("Password Changed", "Your master password has been successfully changed.");
      resetForm();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEncryption = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentPassword) {
      setFormError("Please enter your current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke("remove_encryption", { password: currentPassword });
      setIsEncrypted(false);
      success("Encryption Removed", "Your database is now unencrypted.");
      resetForm();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${isEncrypted ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-200 dark:bg-gray-700"}`}>
            <Database className={`w-6 h-6 ${isEncrypted ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Encryption at Rest
              {isEncrypted && <Shield className="w-4 h-4 text-emerald-500" />}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isEncrypted 
                ? "Your database file is encrypted using SQLCipher." 
                : "Your database file is currently unencrypted."}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {!isEncrypted ? (
            <Button variant="primary" onClick={() => setShowSetPassword(true)}>
              Encrypt Database
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowChangePassword(true)}>
                Change Password
              </Button>
              <Button 
                variant="secondary" 
                className="text-red-600 dark:text-red-400 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/10"
                onClick={() => setShowRemoveEncryption(true)}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Set Password Modal */}
      {showSetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-accent-500" />
                Encrypt Database
              </h3>
            </div>
            
            <form onSubmit={handleSetPassword} className="p-6">
              <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-200">
                <p className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>
                    <strong>Important:</strong> If you lose this master password, you will not be able to recover your data. Please save it in a secure password manager.
                  </span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Master Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500"
                      autoFocus
                      aria-label="Master Password"
                      aria-invalid={isPasswordActive && !hasMinLength}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {/* Strength Meter */}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Password Strength</span>
                      {isPasswordActive && (
                        <span className={`font-semibold ${strength.textColor}`}>
                          {strength.label}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                    </div>
                  </div>

                  {/* Validation Rules */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ValidationItem isValid={hasUppercase} label="Uppercase letter" />
                    <ValidationItem isValid={hasLowercase} label="Lowercase letter" />
                    <ValidationItem isValid={hasNumber} label="Number" />
                    <ValidationItem isValid={hasSpecialChar} label="Special character" />
                    <ValidationItem isValid={hasMinLength} label="At least 8 characters" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500"
                      aria-label="Confirm Password"
                      aria-invalid={isConfirmActive && !passwordsMatch}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Match Indicator */}
                  <div className={`mt-1.5 text-sm transition-opacity duration-300 ${isConfirmActive ? 'opacity-100' : 'opacity-0'}`}>
                    {passwordsMatch ? (
                      <span className="text-emerald-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4"/> Passwords match</span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1.5"><XCircle className="w-4 h-4"/> Passwords do not match</span>
                    )}
                  </div>
                </div>
              </div>

              {formError && (
                <p className="mt-4 text-sm text-red-500 dark:text-red-400">{formError}</p>
              )}

              <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? "Encrypting..." : "Encrypt Database"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-accent-500" />
                Change Master Password
              </h3>
            </div>
            
            <form onSubmit={handleChangePassword} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500"
                      autoFocus
                      aria-label="Current Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Master Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500"
                      aria-label="New Master Password"
                      aria-invalid={isPasswordActive && !hasMinLength}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {/* Strength Meter */}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Password Strength</span>
                      {isPasswordActive && (
                        <span className={`font-semibold ${strength.textColor}`}>
                          {strength.label}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                    </div>
                  </div>

                  {/* Validation Rules */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ValidationItem isValid={hasUppercase} label="Uppercase letter" />
                    <ValidationItem isValid={hasLowercase} label="Lowercase letter" />
                    <ValidationItem isValid={hasNumber} label="Number" />
                    <ValidationItem isValid={hasSpecialChar} label="Special character" />
                    <ValidationItem isValid={hasMinLength} label="At least 8 characters" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500"
                      aria-label="Confirm New Password"
                      aria-invalid={isConfirmActive && !passwordsMatch}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Match Indicator */}
                  <div className={`mt-1.5 text-sm transition-opacity duration-300 ${isConfirmActive ? 'opacity-100' : 'opacity-0'}`}>
                    {passwordsMatch ? (
                      <span className="text-emerald-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4"/> Passwords match</span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1.5"><XCircle className="w-4 h-4"/> Passwords do not match</span>
                    )}
                  </div>
                </div>
              </div>

              {formError && (
                <p className="mt-4 text-sm text-red-500 dark:text-red-400">{formError}</p>
              )}

              <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Encryption Modal */}
      {showRemoveEncryption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden border border-red-200 dark:border-red-900/30">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Remove Encryption
              </h3>
            </div>
            
            <form onSubmit={handleRemoveEncryption} className="p-6">
              <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
                <p className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>
                    This will decrypt your database. Anyone with access to your computer will be able to read your financial data.
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enter Current Master Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
                    autoFocus
                    aria-label="Enter Current Master Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {formError && (
                <p className="mt-4 text-sm text-red-500 dark:text-red-400">{formError}</p>
              )}

              <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !currentPassword}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 font-medium"
                >
                  {isSubmitting ? "Removing..." : "Remove Encryption"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
