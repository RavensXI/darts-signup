"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  CLUB_NIGHTS,
  MAX_CONFIRMED,
  MAX_TOTAL,
  type Signup,
  type Settings,
  type DayName,
} from "@/lib/constants";

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [activeTab, setActiveTab] = useState<DayName>("Monday");
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "clear-night" | "clear-all";
    id?: string;
    night?: string;
  } | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showPinChange, setShowPinChange] = useState(false);
  const [toast, setToast] = useState("");

  const fetchData = useCallback(async () => {
    const [{ data: settingsData }, { data: signupsData }] = await Promise.all([
      getSupabase().from("settings").select("*").eq("id", 1).single(),
      getSupabase().from("signups").select("*").order("created_at", { ascending: true }),
    ]);
    if (settingsData) {
      setSettings(settingsData);
      setAnnouncementDraft(settingsData.announcement || "");
    }
    if (signupsData) setSignups(signupsData);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchData();

    const signupsChannel = getSupabase()
      .channel("admin-signups")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signups" },
        () => fetchData()
      )
      .subscribe();

    const settingsChannel = getSupabase()
      .channel("admin-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(signupsChannel);
      getSupabase().removeChannel(settingsChannel);
    };
  }, [authenticated, fetchData]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await getSupabase()
      .from("settings")
      .select("admin_pin")
      .eq("id", 1)
      .single();

    if (data && data.admin_pin === pinInput) {
      setAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function nightSignups(night: string) {
    const all = signups.filter((s) => s.club_night === night);
    const confirmed = all
      .filter((s) => s.status === "Confirmed")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const reserves = all
      .filter((s) => s.status === "Reserve")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return [...confirmed, ...reserves];
  }

  async function removeSignup(signup: Signup) {
    await getSupabase().from("signups").delete().eq("id", signup.id);

    // Promote first reserve if removing a confirmed signup
    if (signup.status === "Confirmed") {
      const { data: firstReserve } = await getSupabase()
        .from("signups")
        .select("*")
        .eq("club_night", signup.club_night)
        .eq("status", "Reserve")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (firstReserve) {
        await getSupabase()
          .from("signups")
          .update({ status: "Confirmed" })
          .eq("id", firstReserve.id);
      }
    }

    await fetchData();
    showToast(`Removed ${signup.initials}`);
    setConfirmAction(null);
  }

  async function clearNight(night: string) {
    await getSupabase().from("signups").delete().eq("club_night", night);
    await fetchData();
    showToast(`Cleared all signups for ${night}`);
    setConfirmAction(null);
  }

  async function clearAll() {
    await getSupabase().from("signups").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await fetchData();
    showToast("Cleared all signups");
    setConfirmAction(null);
  }

  async function toggleSignups() {
    if (!settings) return;
    await getSupabase()
      .from("settings")
      .update({ signups_open: !settings.signups_open })
      .eq("id", 1);
    await fetchData();
    showToast(settings.signups_open ? "Signups closed" : "Signups opened");
  }

  async function saveAnnouncement() {
    await getSupabase()
      .from("settings")
      .update({ announcement: announcementDraft || null })
      .eq("id", 1);
    await fetchData();
    showToast("Announcement updated");
  }

  async function changePin() {
    if (newPin.length < 4) return;
    await getSupabase()
      .from("settings")
      .update({ admin_pin: newPin })
      .eq("id", 1);
    await fetchData();
    setNewPin("");
    setShowPinChange(false);
    showToast("PIN changed");
  }

  const currentSignups = nightSignups(activeTab);
  const nightInfo = CLUB_NIGHTS.find((n) => n.day === activeTab)!;
  const confirmedCount = currentSignups.filter(
    (s) => s.status === "Confirmed"
  ).length;
  const reserveCount = currentSignups.filter(
    (s) => s.status === "Reserve"
  ).length;

  // PIN entry screen
  if (!authenticated) {
    return (
      <main className="min-h-screen bg-dart-cream flex items-center justify-center px-4">
        <form
          onSubmit={handlePinSubmit}
          className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm space-y-4"
        >
          <div className="text-center">
            <div className="text-4xl mb-2">🔒</div>
            <h1 className="text-xl font-bold text-dart-green-dark">Admin Access</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your PIN to continue</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
            }}
            placeholder="Enter PIN"
            className={`w-full px-4 py-3 text-xl text-center tracking-[0.5em] border-2 rounded-xl focus:outline-none focus:ring-2 ${
              pinError
                ? "border-dart-red focus:border-dart-red focus:ring-dart-red/20"
                : "border-gray-200 focus:border-dart-green focus:ring-dart-green/20"
            }`}
            autoFocus
          />
          {pinError && (
            <p className="text-dart-red text-sm text-center">Incorrect PIN</p>
          )}
          <button
            type="submit"
            className="w-full bg-dart-green hover:bg-dart-green-light text-white font-bold py-3 rounded-xl transition-colors active:scale-[0.98]"
          >
            Enter
          </button>
          <a
            href="/"
            className="block text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Back to signup page
          </a>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dart-cream">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-dart-green text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium animate-fade-in no-print">
          {toast}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center px-4 no-print">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-lg text-dart-green-dark">Are you sure?</h3>
            <p className="text-gray-600 text-sm">
              {confirmAction.type === "remove" &&
                "This will remove this student from the list."}
              {confirmAction.type === "clear-night" &&
                `This will clear all signups for ${confirmAction.night}.`}
              {confirmAction.type === "clear-all" &&
                "This will clear ALL signups across every night. This is the weekly reset."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2 rounded-xl border-2 border-gray-200 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === "remove" && confirmAction.id) {
                    const signup = signups.find((s) => s.id === confirmAction.id);
                    if (signup) removeSignup(signup);
                  } else if (
                    confirmAction.type === "clear-night" &&
                    confirmAction.night
                  ) {
                    clearNight(confirmAction.night);
                  } else if (confirmAction.type === "clear-all") {
                    clearAll();
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-dart-red text-white font-medium hover:bg-dart-red-light transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-dart-green-dark text-white py-4 px-4 shadow-lg no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Darts Club Admin</h1>
            <p className="text-dart-cream/60 text-xs">Manage signups and settings</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSignups}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                settings?.signups_open
                  ? "bg-green-500/20 text-green-200 hover:bg-green-500/30"
                  : "bg-red-500/20 text-red-200 hover:bg-red-500/30"
              }`}
            >
              Signups {settings?.signups_open ? "OPEN" : "CLOSED"}
            </button>
            <a
              href="/"
              className="text-dart-cream/60 hover:text-white text-sm transition-colors"
            >
              View site
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Night tabs */}
        <div className="flex gap-2 overflow-x-auto no-print">
          {CLUB_NIGHTS.map((night) => {
            const count = signups.filter(
              (s) => s.club_night === night.day
            ).length;
            return (
              <button
                key={night.day}
                onClick={() => setActiveTab(night.day)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === night.day
                    ? "bg-dart-green text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                {night.day} ({count})
              </button>
            );
          })}
        </div>

        {/* Current night info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4 no-print">
            <div>
              <h2 className="text-lg font-bold text-dart-green-dark">
                {activeTab} — {nightInfo.yearGroup}
              </h2>
              <p className="text-sm text-gray-500">
                {confirmedCount}/{MAX_CONFIRMED} confirmed, {reserveCount}/
                {MAX_TOTAL - MAX_CONFIRMED} reserve
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Print
              </button>
              <button
                onClick={() =>
                  setConfirmAction({
                    type: "clear-night",
                    night: activeTab,
                  })
                }
                className="px-3 py-1.5 text-xs rounded-lg border border-dart-red/30 text-dart-red hover:bg-red-50 transition-colors"
              >
                Clear {activeTab}
              </button>
            </div>
          </div>

          {/* Print header (only visible when printing) */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold">
              Darts Club — {activeTab} ({nightInfo.yearGroup})
            </h2>
            <p className="text-sm text-gray-500">
              {confirmedCount} confirmed, {reserveCount} reserve
            </p>
          </div>

          {/* Signup list */}
          {currentSignups.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              No signups yet for {activeTab}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {currentSignups.map((signup, index) => {
                const isConfirmed = signup.status === "Confirmed";
                const position = isConfirmed
                  ? currentSignups
                      .filter((s) => s.status === "Confirmed")
                      .indexOf(signup) + 1
                  : currentSignups
                      .filter((s) => s.status === "Reserve")
                      .indexOf(signup) + 1;

                return (
                  <div
                    key={signup.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isConfirmed
                            ? "bg-dart-green/10 text-dart-green"
                            : "bg-dart-gold/20 text-dart-gold"
                        }`}
                      >
                        {isConfirmed ? position : `R${position}`}
                      </span>
                      <div>
                        <span className="font-bold text-sm tracking-wider">
                          {signup.initials}
                        </span>
                        <span
                          className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                            isConfirmed
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {signup.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {new Date(signup.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        onClick={() =>
                          setConfirmAction({
                            type: "remove",
                            id: signup.id,
                          })
                        }
                        className="text-gray-300 hover:text-dart-red transition-colors no-print"
                        title="Remove"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings section */}
        <div className="space-y-4 no-print">
          {/* Announcement */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-3">
            <h3 className="font-bold text-dart-green-dark text-sm">
              Announcement Banner
            </h3>
            <textarea
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
              placeholder="e.g. No darts club this Friday due to school trip"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-dart-green focus:outline-none focus:ring-2 focus:ring-dart-green/20 resize-none"
            />
            <button
              onClick={saveAnnouncement}
              className="px-4 py-2 bg-dart-green text-white text-sm font-medium rounded-xl hover:bg-dart-green-light transition-colors"
            >
              Save Announcement
            </button>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5 space-y-3">
            <h3 className="font-bold text-dart-red text-sm">Admin Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setConfirmAction({ type: "clear-all" })}
                className="px-4 py-2 border-2 border-dart-red/30 text-dart-red text-sm font-medium rounded-xl hover:bg-red-50 transition-colors"
              >
                Clear All Signups (Weekly Reset)
              </button>
              <button
                onClick={() => setShowPinChange(!showPinChange)}
                className="px-4 py-2 border-2 border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Change PIN
              </button>
            </div>
            {showPinChange && (
              <div className="flex gap-2 items-center mt-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="New PIN"
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-dart-green focus:outline-none w-32"
                />
                <button
                  onClick={changePin}
                  disabled={newPin.length < 4}
                  className="px-4 py-2 bg-dart-green text-white text-sm font-medium rounded-xl hover:bg-dart-green-light transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
