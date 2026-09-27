import React, { useState } from 'react';
import { User, Role } from '../types';
import {
  Users,
  UserPlus,
  Shield,
  Sliders,
  Award,
  Tablet,
  Tv,
  FileCheck,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Bell,
  Sparkles,
  Lock
} from 'lucide-react';

interface UserManagementTabProps {
  users: User[];
  onRefresh: () => Promise<void>;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({ users, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalUser, setPinModalUser] = useState<User | null>(null);
  const [newPinInput, setNewPinInput] = useState('');
  const [showPinInModal, setShowPinInModal] = useState(false);

  // Form state
  const [formState, setFormState] = useState({
    username: '',
    name: '',
    name_dhivehi: '',
    password: '',
    role: 'PRESENTATION_OPERATOR' as Role,
    status: 'active' as 'active' | 'inactive',
    judge_code: '',
    can_trigger_stage_bells: false
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const togglePinReveal = (userId: string) => {
    setRevealedPins(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormState({
      username: '',
      name: '',
      name_dhivehi: '',
      password: '',
      role: 'PRESENTATION_OPERATOR',
      status: 'active',
      judge_code: '',
      can_trigger_stage_bells: false
    });
    setFormError(null);
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setFormState({
      username: u.username,
      name: u.name,
      name_dhivehi: u.name_dhivehi || '',
      password: u.password || '',
      role: u.role,
      status: u.status,
      judge_code: u.judge_code || '',
      can_trigger_stage_bells: Boolean(u.can_trigger_stage_bells)
    });
    setFormError(null);
    setShowAddEditModal(true);
  };

  const handleOpenQuickPin = (u: User) => {
    setPinModalUser(u);
    setNewPinInput(u.password || '');
    setShowPinModal(true);
  };

  const handleSavePinQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalUser) return;
    if (!newPinInput.trim()) {
      alert('Please enter a new PIN or password.');
      return;
    }

    try {
      const res = await fetch(`/api/users/${pinModalUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: newPinInput.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update PIN');
      }

      setShowPinModal(false);
      showNotification(`PIN updated for ${pinModalUser.username}`);
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error updating PIN');
    }
  };

  const handleSaveUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.username.trim() || !formState.password.trim() || !formState.name.trim()) {
      setFormError('Username, PIN/password, and Name are required.');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save user');
      }

      setShowAddEditModal(false);
      showNotification(editingUser ? `User ${formState.username} updated.` : `New user ${formState.username} created.`);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error saving user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.username === 'admin' || u.id === 'u-admin') {
      alert('The primary administrator account cannot be deleted.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete "${u.username}" (${u.name})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete user');
      }
      showNotification(`User ${u.username} deleted.`);
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error deleting user');
    }
  };

  const handleToggleStatus = async (u: User) => {
    if (u.username === 'admin' && u.status === 'active') {
      alert('The primary administrator account cannot be deactivated.');
      return;
    }

    const nextStatus = u.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showNotification(`${u.username} marked as ${nextStatus}.`);
        await onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getRoleConfig = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return {
          label: 'Administrator',
          label_dhivehi: 'މުބާރާތުގެ ވެރިޔާ (އެޑްމިން)',
          icon: Shield,
          color: 'bg-purple-100 text-purple-800 border-purple-200',
          badgeColor: 'bg-purple-700 text-white'
        };
      case 'PRESENTATION_OPERATOR':
        return {
          label: 'Stage Controller',
          label_dhivehi: 'ސްޓޭޖް އޮޕަރޭޓަރު',
          icon: Sliders,
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          badgeColor: 'bg-emerald-700 text-white'
        };
      case 'JUDGE':
        return {
          label: 'Judge',
          label_dhivehi: 'ފަނޑިޔާރު',
          icon: Award,
          color: 'bg-amber-100 text-amber-800 border-amber-200',
          badgeColor: 'bg-amber-600 text-white'
        };
      case 'PODIUM':
        return {
          label: 'Podium Screen',
          label_dhivehi: 'ޕޯޑިއަމް ސްކްރީން',
          icon: Tablet,
          color: 'bg-sky-100 text-sky-800 border-sky-200',
          badgeColor: 'bg-sky-600 text-white'
        };
      case 'AUDIENCE':
        return {
          label: 'Audience TV',
          label_dhivehi: 'އޯޑިއަންސް ސްކްރީން',
          icon: Tv,
          color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          badgeColor: 'bg-indigo-600 text-white'
        };
      case 'RESULT_OFFICER':
        return {
          label: 'Result Officer',
          label_dhivehi: 'ނަތީޖާ އޮފިސަރު',
          icon: FileCheck,
          color: 'bg-slate-100 text-slate-800 border-slate-200',
          badgeColor: 'bg-slate-700 text-white'
        };
      default:
        return {
          label: role,
          label_dhivehi: role,
          icon: Users,
          color: 'bg-slate-100 text-slate-800 border-slate-200',
          badgeColor: 'bg-slate-700 text-white'
        };
    }
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name_dhivehi && u.name_dhivehi.includes(searchTerm));

    const matchesRole = selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  // Summary counts
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const operatorCount = users.filter(u => u.role === 'PRESENTATION_OPERATOR').length;
  const judgeCount = users.filter(u => u.role === 'JUDGE').length;
  const displayCount = users.filter(u => u.role === 'PODIUM' || u.role === 'AUDIENCE').length;

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-700 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Banner & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 font-dhivehi">
              ޔޫޒަރުންގެ މެނޭޖްމަންޓް / User Management
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
              {users.length} Users
            </span>
          </div>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Manage system access, update full names, modify roles, and change PIN passwords for all portals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Admin built-in PIN reminder badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-semibold">
            <Lock size={13} className="text-amber-600" />
            <span>Admin PIN: <strong className="font-mono text-amber-800 font-bold">602613</strong></span>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <UserPlus size={15} />
            <span className="font-dhivehi">ޔޫޒަރެއް އިތުރުކުރައްވާ</span>
            <span className="font-sans">/ Add User</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-xs text-slate-500 font-semibold font-dhivehi">ޖުމްލަ ޔޫޒަރުން</div>
          <div className="text-xl font-bold text-slate-800 mt-0.5">{totalCount}</div>
          <div className="text-[10px] text-slate-400">Total Users</div>
        </div>

        <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl text-center">
          <div className="text-xs text-purple-700 font-semibold font-dhivehi">އެޑްމިނިސްޓްރޭޓަރ</div>
          <div className="text-xl font-bold text-purple-900 mt-0.5">{adminCount}</div>
          <div className="text-[10px] text-purple-600">Admin (PIN: 602613)</div>
        </div>

        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-center">
          <div className="text-xs text-emerald-700 font-semibold font-dhivehi">ސްޓޭޖް އޮޕަރޭޓަރ</div>
          <div className="text-xl font-bold text-emerald-900 mt-0.5">{operatorCount}</div>
          <div className="text-[10px] text-emerald-600">Stage Controller</div>
        </div>

        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-center">
          <div className="text-xs text-amber-700 font-semibold font-dhivehi">ފަނޑިޔާރުން</div>
          <div className="text-xl font-bold text-amber-900 mt-0.5">{judgeCount}</div>
          <div className="text-[10px] text-amber-600">Judges Panel</div>
        </div>

        <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl text-center col-span-2 sm:col-span-1">
          <div className="text-xs text-sky-700 font-semibold font-dhivehi">ސްކްރީން ޑިސްޕްލޭ</div>
          <div className="text-xl font-bold text-sky-900 mt-0.5">{displayCount}</div>
          <div className="text-[10px] text-sky-600">Podium & TV</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={15} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or username..."
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* Role Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'ADMIN', label: 'Admin' },
            { id: 'PRESENTATION_OPERATOR', label: 'Operator' },
            { id: 'JUDGE', label: 'Judges' },
            { id: 'PODIUM', label: 'Podium' },
            { id: 'AUDIENCE', label: 'Audience' },
            { id: 'RESULT_OFFICER', label: 'Officers' }
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRoleFilter(r.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedRoleFilter === r.id
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table / Grid */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">User / ޔޫޒަރު</th>
              <th className="py-3 px-4">Role / ރޯލް</th>
              <th className="py-3 px-4">PIN / Password</th>
              <th className="py-3 px-4">Permissions</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  ޔޫޒަރެއް ނުފެނުނު (No users found matching your criteria)
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const roleConfig = getRoleConfig(u.role);
                const RoleIcon = roleConfig.icon;
                const isPinRevealed = Boolean(revealedPins[u.id]);
                const isMainAdmin = u.username === 'admin' || u.id === 'u-admin';

                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* User info */}
                    <td className="py-3 px-4">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${roleConfig.color}`}>
                          <RoleIcon size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 font-dhivehi text-sm">
                            {u.name_dhivehi || u.name}
                          </div>
                          <div className="text-slate-500 font-sans text-xs">
                            {u.name}
                          </div>
                          <div className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded inline-block mt-0.5">
                            @{u.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${roleConfig.color}`}>
                        <RoleIcon size={12} />
                        <span>{roleConfig.label}</span>
                      </span>
                      <div className="text-[10px] text-slate-400 font-dhivehi mt-0.5">
                        {roleConfig.label_dhivehi}
                      </div>
                    </td>

                    {/* PIN / Password with toggle */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-xs px-2.5 py-1 bg-slate-100 rounded border border-slate-300 font-bold min-w-20 text-center tracking-wider">
                          {isPinRevealed ? (
                            <span className="text-emerald-950 font-semibold">{u.password || '••••••'}</span>
                          ) : (
                            <span className="text-slate-500">••••••</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePinReveal(u.id)}
                          title={isPinRevealed ? 'Hide PIN' : 'Show PIN'}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          {isPinRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenQuickPin(u)}
                          title="Change PIN"
                          className="px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 rounded border border-emerald-300 transition-colors cursor-pointer"
                        >
                          Change PIN
                        </button>
                      </div>
                    </td>

                    {/* Permissions */}
                    <td className="py-3 px-4">
                      {u.role === 'JUDGE' ? (
                        <div className="space-y-1">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                            {u.judge_code || 'JUDGE'}
                          </span>
                          {u.can_trigger_stage_bells ? (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                              <Bell size={12} className="text-amber-600" />
                              <span>Chief Bell Judge</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Scoring Only</div>
                          )}
                        </div>
                      ) : u.role === 'ADMIN' ? (
                        <span className="text-[11px] font-semibold text-purple-700">Full System Control</span>
                      ) : u.role === 'PRESENTATION_OPERATOR' ? (
                        <span className="text-[11px] font-semibold text-emerald-700">Stage & Questions</span>
                      ) : u.role === 'PODIUM' ? (
                        <span className="text-[11px] font-semibold text-sky-700">Podium Kiosk (No Nav)</span>
                      ) : u.role === 'AUDIENCE' ? (
                        <span className="text-[11px] font-semibold text-indigo-700">Audience TV Display</span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Standard Access</span>
                      )}
                    </td>

                    {/* Status Toggle */}
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        disabled={isMainAdmin}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        } ${isMainAdmin ? 'cursor-default opacity-80' : ''}`}
                      >
                        {u.status === 'active' ? '● Active' : '○ Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(u)}
                          title="Edit Details / Role / PIN"
                          className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 size={15} />
                        </button>

                        {!isMainAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            title="Delete User"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: Add / Edit User Full Details */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-scale-up">
            
            <div className="bg-emerald-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  {editingUser ? 'Edit User Credentials & Roles' : 'Create System User'}
                </span>
                <h3 className="text-lg font-bold font-dhivehi text-white mt-0.5">
                  {editingUser ? 'ޔޫޒަރުގެ މަޢުލޫމާތު ބަދަލުކުރެއްވުން' : 'އައު ޔޫޒަރެއް ރަޖިސްޓަރީ ކުރެއްވުން'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="w-8 h-8 rounded-lg bg-emerald-800/80 hover:bg-emerald-800 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="m-4 p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUserForm} className="p-5 space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Username */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ޔޫޒަރނޭމް / Username <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.username}
                    onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                    placeholder="e.g. operator, judge5"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-sans focus:outline-none focus:border-emerald-600"
                    dir="ltr"
                  />
                </div>

                {/* PIN / Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      ޕިން ކޯޑް / PIN <span className="text-rose-500">*</span>:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
                        setFormState({ ...formState, password: randomPin });
                      }}
                      className="text-[10px] text-emerald-800 hover:underline"
                    >
                      Generate 6-digit
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formState.password}
                      onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                      placeholder="e.g. 602613, 1234"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono tracking-wider focus:outline-none focus:border-emerald-600"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Full Name in Dhivehi */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ފުރިހަމަ ނަން (ދިވެހި / Thaana):
                </label>
                <input
                  type="text"
                  value={formState.name_dhivehi}
                  onChange={(e) => setFormState({ ...formState, name_dhivehi: e.target.value })}
                  placeholder="ދިވެހިން ނަން ލިޔުއްވާ..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-dhivehi text-sm focus:outline-none focus:border-emerald-600"
                  dir="rtl"
                />
              </div>

              {/* Full Name in English */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name (English) <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="e.g. Sheikh Mohamed Latheef, Stage Controller"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-sans focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ރޯލް / System Role <span className="text-rose-500">*</span>:
                </label>
                <select
                  value={formState.role}
                  onChange={(e) => setFormState({ ...formState, role: e.target.value as Role })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                >
                  <option value="PRESENTATION_OPERATOR">
                    PRESENTATION_OPERATOR - ސްޓޭޖް އޮޕަރޭޓަރު (Stage & Display Controller)
                  </option>
                  <option value="JUDGE">
                    JUDGE - ފަނޑިޔާރު (Judges Scoring Panel)
                  </option>
                  <option value="ADMIN">
                    ADMIN - މުބާރާތުގެ ވެރިޔާ (System Director - All Access)
                  </option>
                  <option value="PODIUM">
                    PODIUM - ޕޯޑިއަމް ސްކްރީން (Stage Podium Tablet Display)
                  </option>
                  <option value="AUDIENCE">
                    AUDIENCE - އޯޑިއަންސް ސްކްރީން (TV / Projector Screen)
                  </option>
                  <option value="RESULT_OFFICER">
                    RESULT_OFFICER - ނަތީޖާ އޮފިސަރު (Official Results Verification)
                  </option>
                </select>
              </div>

              {/* If Judge Role, display Judge specific controls */}
              {formState.role === 'JUDGE' && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      ޖަޖް ކޯޑް / Judge Code (e.g. J-01):
                    </label>
                    <input
                      type="text"
                      value={formState.judge_code}
                      onChange={(e) => setFormState({ ...formState, judge_code: e.target.value })}
                      placeholder="J-01"
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-mono focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={formState.can_trigger_stage_bells}
                      onChange={(e) => setFormState({ ...formState, can_trigger_stage_bells: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-bold text-amber-900">
                      ސްޓޭޖް ކޮންޓްރޯލް ބެލް ޖެހުމުގެ އިޚްތިޔާރު ދިނުން (Can Trigger Stage Bells)
                    </span>
                  </label>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ސްޓޭޓަސް / Status:
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="user_status"
                      value="active"
                      checked={formState.status === 'active'}
                      onChange={() => setFormState({ ...formState, status: 'active' })}
                    />
                    <span className="font-semibold text-slate-800">Active (ވަދެވޭ ގޮތަށް)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="user_status"
                      value="inactive"
                      checked={formState.status === 'inactive'}
                      onChange={() => setFormState({ ...formState, status: 'inactive' })}
                    />
                    <span className="font-semibold text-slate-800">Inactive (ހުއްޓުވާފައި)</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {formLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{editingUser ? 'Save Changes' : 'Create User'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Change PIN */}
      {showPinModal && pinModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden animate-scale-up">
            
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm text-white">
                  Change PIN for @{pinModalUser.username}
                </h3>
              </div>
              <button
                onClick={() => setShowPinModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePinQuick} className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">User Identity:</span>
                <strong className="text-slate-900 text-sm block font-dhivehi">
                  {pinModalUser.name_dhivehi || pinModalUser.name}
                </strong>
                <span className="text-slate-400 text-xs font-sans">
                  {pinModalUser.name}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  އައު ޕިން ކޯޑް / New PIN:
                </label>
                <div className="relative">
                  <input
                    type={showPinInModal ? 'text' : 'password'}
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value)}
                    placeholder="Enter new PIN / password"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm tracking-widest focus:outline-none focus:border-emerald-600"
                    autoFocus
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinInModal(!showPinInModal)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    {showPinInModal ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[10px] text-slate-400">Recommended: 4 to 6 numbers</span>
                  <button
                    type="button"
                    onClick={() => {
                      const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
                      setNewPinInput(randomPin);
                      setShowPinInModal(true);
                    }}
                    className="text-[10px] text-emerald-700 hover:underline font-semibold"
                  >
                    Generate Random
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold shadow-xs cursor-pointer"
                >
                  Update PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
