"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useState } from "react";
import {
  Pencil,
  Trash2,
  UserPlus,
  Plus,
  Building2,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  Shield,
  Phone,
  Lock,
  User as UserIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

export type User = {
  id: string;
  name: string;
  phone: string;
  role: "OWNER" | "WORKER";
  active: boolean;
  branchId?: string;
  businessId: string;
};

export type Branch = {
  id: string;
  name: string;
  businessId: string;
};

export default function OwnerManagement() {
  const qc = useQueryClient();
  const { user, business } = useAuthStore();
  const businessId = user?.businessId || business?.id;
  const businessName = business?.name || user?.businessName || "My Business";

  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users", businessId],
    queryFn: async () =>
      (await api.get("/users", { params: { businessId } })).data as User[],
    enabled: !!businessId,
  });

  const { data: branches, isLoading: branchesLoading } = useQuery({
    queryKey: ["branches", businessId],
    queryFn: async () =>
      (
        await api.get("/branches", {
          headers: { "x-business-id": businessId ?? "" },
        })
      ).data as Branch[],
    enabled: !!businessId,
  });

  const muDeleteUser = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users", businessId] });
    },
    onError: (err: any) => {
      setErrorMessage(err?.response?.data?.message || "Failed to delete user");
    },
  });

  const muDeleteBranch = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/branches/${id}`, {
        headers: { "x-business-id": businessId ?? "" },
      });
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches", businessId] });
    },
    onError: (err: any) => {
      setErrorMessage(
        err?.response?.data?.message ||
          "Cannot delete this branch because it already contains shifts, stock, or payments."
      );
    },
  });

  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Staff & Branch Management
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage staff member logins, counter access, and operational branches for{" "}
          <span className="font-semibold text-indigo-400">{businessName}</span>.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Section 1: Staff / Team Members */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>Staff & Counter Workers</span>
            </h2>
            <p className="text-xs text-slate-400">
              Staff members use their phone number and password to log in and conduct shift counts at /worker.
            </p>
          </div>
          <button
            onClick={() => setShowAddUser(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>

        {usersLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !users?.length ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="font-medium text-white">No staff members created yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Add your bartenders or cashiers so they can open shifts and count stock on their phones.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
            <table className="min-w-full divide-y divide-slate-800 text-left">
              <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Phone (Login ID)</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm text-slate-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{u.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-slate-300">{u.phone || "—"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.role === "OWNER"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
                        title="Edit user"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove staff member "${u.name}"?`)) {
                              muDeleteUser.mutate(u.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors cursor-pointer"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: Operational Branches */}
      <section className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <span>Operational Branches & Bars</span>
            </h2>
            <p className="text-xs text-slate-400">
              Each branch operates its own inventory, cash float, and shift periods.
            </p>
          </div>
          <button
            onClick={() => setShowAddBranch(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Branch</span>
          </button>
        </div>

        {branchesLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !branches?.length ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="font-medium text-white">No branches added yet</p>
            <p className="text-xs text-slate-400 mt-1">Add a branch location like &quot;Main Bar&quot; or &quot;Rooftop&quot;.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
            <table className="min-w-full divide-y divide-slate-800 text-left">
              <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Branch Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm text-slate-200">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{b.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Operational
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => setEditingBranch(b)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
                        title="Rename branch"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Rename</span>
                      </button>
                      {branches.length > 1 && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete branch "${b.name}"? This cannot be undone.`)) {
                              muDeleteBranch.mutate(b.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors cursor-pointer"
                          title="Delete branch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* User Modal */}
      {showAddUser && (
        <UserModal
          bizId={businessId}
          branches={branches ?? []}
          onClose={() => setShowAddUser(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["users", businessId] });
            setShowAddUser(false);
          }}
        />
      )}

      {editingUser && (
        <UserModal
          bizId={businessId}
          branches={branches ?? []}
          editing={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["users", businessId] });
            setEditingUser(null);
          }}
        />
      )}

      {/* Branch Modal */}
      {showAddBranch && (
        <BranchModal
          bizId={businessId}
          onClose={() => setShowAddBranch(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["branches", businessId] });
            setShowAddBranch(false);
          }}
        />
      )}

      {editingBranch && (
        <BranchModal
          bizId={businessId}
          editing={editingBranch}
          onClose={() => setEditingBranch(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["branches", businessId] });
            setEditingBranch(null);
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// USER MODAL (High-contrast, production dark theme)
// -----------------------------------------------------------------------------
function UserModal({
  bizId,
  branches,
  editing,
  onClose,
  onSuccess,
}: {
  bizId: string;
  branches: Branch[];
  editing?: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [role, setRole] = useState<"OWNER" | "WORKER">(editing?.role ?? "WORKER");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState(editing?.branchId ?? branches[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter the user's full name");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter a phone number (used for login)");
      return;
    }
    if (!isEdit && !password.trim()) {
      setError("Please enter a password for this user");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/users/${editing.id}`, {
          name: name.trim(),
          phone: phone.trim(),
          role,
        });
      } else {
        await api.post("/users", {
          name: name.trim(),
          phone: phone.trim(),
          password: password.trim(),
          role,
          branchId: branchId || undefined,
          businessId: bizId,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Failed to save user. Please verify the phone number is unique."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 grid place-items-center">
              <UserIcon className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Edit Staff Member" : "Add Staff Member"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Full Name *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Phone Number (Login ID) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712 345 678"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "OWNER" | "WORKER")}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
              >
                <option value="WORKER">Worker (Bartender)</option>
                <option value="OWNER">Owner / Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Assigned Branch
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Login Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !phone.trim()}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Update Staff" : "Add Staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// BRANCH MODAL (High-contrast, production dark theme)
// -----------------------------------------------------------------------------
function BranchModal({
  bizId,
  editing,
  onClose,
  onSuccess,
}: {
  bizId: string;
  editing?: Branch;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter a branch name");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/branches/${editing.id}`, { name: name.trim() });
      } else {
        await api.post("/branches", {
          name: name.trim(),
          businessId: bizId,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to save branch");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 grid place-items-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Rename Branch" : "Add Branch"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Branch Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Bar, Rooftop Lounge, VIP Counter"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save Change" : "Create Branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}