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

type NightCounts = Record<string, { confirmed: number; reserve: number }>;

export default function HomePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [selectedNight, setSelectedNight] = useState<DayName | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [cancelFirstName, setCancelFirstName] = useState("");
  const [cancelLastInitial, setCancelLastInitial] = useState("");
  const [cancelNight, setCancelNight] = useState<DayName>("Monday");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchData = useCallback(async () => {
    const [{ data: settingsData }, { data: signupsData }] = await Promise.all([
      getSupabase().from("settings").select("*").eq("id", 1).single(),
      getSupabase().from("signups").select("*").order("created_at", { ascending: true }),
    ]);
    if (settingsData) setSettings(settingsData);
    if (signupsData) setSignups(signupsData);
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    fetchData();

    const signupsChannel = getSupabase()
      .channel("signups-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signups" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const settingsChannel = getSupabase()
      .channel("settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(signupsChannel);
      getSupabase().removeChannel(settingsChannel);
    };
  }, [fetchData]);

  const counts: NightCounts = {};
  for (const night of CLUB_NIGHTS) {
    const nightSignups = signups.filter((s) => s.club_night === night.day);
    counts[night.day] = {
      confirmed: nightSignups.filter((s) => s.status === "Confirmed").length,
      reserve: nightSignups.filter((s) => s.status === "Reserve").length,
    };
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNight || !firstName.trim() || !lastInitial) return;

    setLoading(true);
    setMessage(null);

    const name = firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase();
    const trimmed = `${name} ${lastInitial.toUpperCase()}`;
    const night = CLUB_NIGHTS.find((n) => n.day === selectedNight)!;
    const nightCount = counts[selectedNight];
    const total = nightCount.confirmed + nightCount.reserve;

    if (total >= MAX_TOTAL) {
      setMessage({
        type: "error",
        text: `Sorry, ${selectedNight} is fully booked! All ${MAX_TOTAL} spots are taken.`,
      });
      setLoading(false);
      return;
    }

    const status = nightCount.confirmed < MAX_CONFIRMED ? "Confirmed" : "Reserve";

    const { error } = await getSupabase().from("signups").insert({
      initials: trimmed,
      year_group: night.yearGroup,
      club_night: selectedNight,
      status,
    });

    if (error) {
      if (error.code === "23505") {
        setMessage({
          type: "error",
          text: "Looks like that name is already signed up for this night!",
        });
      } else {
        setMessage({
          type: "error",
          text: "Something went wrong. Please try again.",
        });
      }
      setLoading(false);
      return;
    }

    await fetchData();

    if (status === "Confirmed") {
      const position = nightCount.confirmed + 1;
      setMessage({
        type: "success",
        text: `You're in! You're number ${position}. See you on ${selectedNight}!`,
      });
    } else {
      const reservePosition = nightCount.reserve + 1;
      setMessage({
        type: "success",
        text: `You're on the reserve list (position ${reservePosition}). We'll let you know if a spot opens up.`,
      });
    }

    setFirstName("");
    setLastInitial("");
    setLoading(false);
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelFirstName.trim() || !cancelLastInitial) return;

    setLoading(true);
    setMessage(null);

    const name = cancelFirstName.trim().charAt(0).toUpperCase() + cancelFirstName.trim().slice(1).toLowerCase();
    const trimmed = `${name} ${cancelLastInitial.toUpperCase()}`;

    const { data: existing } = await getSupabase()
      .from("signups")
      .select("*")
      .eq("initials", trimmed)
      .eq("club_night", cancelNight)
      .single();

    if (!existing) {
      setMessage({
        type: "error",
        text: "No signup found with those initials for that night.",
      });
      setLoading(false);
      return;
    }

    const wasConfirmed = existing.status === "Confirmed";

    const { error } = await getSupabase()
      .from("signups")
      .delete()
      .eq("id", existing.id);

    if (error) {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
      setLoading(false);
      return;
    }

    // If they were confirmed, promote the first reserve
    if (wasConfirmed) {
      const { data: firstReserve } = await getSupabase()
        .from("signups")
        .select("*")
        .eq("club_night", cancelNight)
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
    setMessage({
      type: "success",
      text: `Your signup for ${cancelNight} has been cancelled.`,
    });
    setCancelFirstName("");
    setCancelLastInitial("");
    setLoading(false);
  }

  if (initialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dart-cream">
        <div className="animate-pulse text-dart-green text-xl font-semibold">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-dart-cream">
      {/* Header */}
      <header className="bg-dart-green-dark text-white py-6 px-4 shadow-lg">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold tracking-tight">Darts Club</h1>
          <p className="text-dart-cream/80 mt-1 text-sm">
            Sign up for your weekly session
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Announcement banner */}
        {settings?.announcement && (
          <div className="bg-dart-gold/20 border border-dart-gold rounded-xl px-4 py-3 text-sm text-dart-green-dark font-medium">
            {settings.announcement}
          </div>
        )}

        {/* Signups closed */}
        {settings && !settings.signups_open ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-xl font-bold text-dart-green-dark mb-2">
              Signups aren&apos;t open yet
            </h2>
            <p className="text-gray-500">
              Check back soon — your PE teacher will open signups when
              it&apos;s time.
            </p>
          </div>
        ) : (
          <>
            {/* Feedback message */}
            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  message.type === "success"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-red-100 text-red-800 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Club night cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CLUB_NIGHTS.map((night) => {
                const c = counts[night.day];
                const spotsLeft = MAX_CONFIRMED - c.confirmed;
                const reserveLeft = MAX_TOTAL - MAX_CONFIRMED - c.reserve;
                const fillPercent = (c.confirmed / MAX_CONFIRMED) * 100;
                const isSelected = selectedNight === night.day && !showCancel;

                return (
                  <button
                    key={night.day}
                    onClick={() => {
                      setSelectedNight(night.day);
                      setShowCancel(false);
                      setMessage(null);
                      setFirstName("");
                      setLastInitial("");
                    }}
                    className={`bg-white rounded-2xl shadow-sm border-2 p-5 text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? "border-dart-green ring-2 ring-dart-green/20"
                        : "border-gray-200 hover:border-dart-green/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-lg text-dart-green-dark">
                          {night.day}
                        </h3>
                        <p className="text-sm text-gray-500">{night.yearGroup}</p>
                      </div>
                      <div
                        className={`text-right ${
                          spotsLeft === 0
                            ? "text-dart-red"
                            : spotsLeft <= 5
                            ? "text-dart-gold"
                            : "text-dart-green"
                        }`}
                      >
                        <span className="text-2xl font-bold">{spotsLeft}</span>
                        <p className="text-xs">
                          spot{spotsLeft !== 1 ? "s" : ""} left
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          fillPercent >= 100
                            ? "bg-dart-red"
                            : fillPercent >= 70
                            ? "bg-dart-gold"
                            : "bg-dart-green"
                        }`}
                        style={{ width: `${Math.min(fillPercent, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                      <span>
                        {c.confirmed}/{MAX_CONFIRMED} confirmed
                      </span>
                      {spotsLeft === 0 && reserveLeft > 0 && (
                        <span className="text-dart-gold font-medium">
                          {reserveLeft} reserve spot{reserveLeft !== 1 ? "s" : ""}
                        </span>
                      )}
                      {spotsLeft === 0 && reserveLeft === 0 && (
                        <span className="text-dart-red font-medium">Full</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Signup form */}
            {selectedNight && !showCancel && (
              <form
                onSubmit={handleSignup}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4"
              >
                <h3 className="font-bold text-dart-green-dark">
                  Sign up for {selectedNight} —{" "}
                  {CLUB_NIGHTS.find((n) => n.day === selectedNight)?.yearGroup}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="first-name"
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      First name
                    </label>
                    <input
                      id="first-name"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) =>
                        setFirstName(e.target.value.replace(/[^a-zA-Z\-]/g, ""))
                      }
                      placeholder="e.g. James"
                      className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-dart-green focus:outline-none focus:ring-2 focus:ring-dart-green/20"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="last-initial"
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      Last name initial
                    </label>
                    <select
                      id="last-initial"
                      required
                      value={lastInitial}
                      onChange={(e) => setLastInitial(e.target.value)}
                      className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-dart-green focus:outline-none focus:ring-2 focus:ring-dart-green/20"
                    >
                      <option value="">--</option>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                        <option key={letter} value={letter}>
                          {letter}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !firstName.trim() || !lastInitial}
                  className="w-full bg-dart-green hover:bg-dart-green-light text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg active:scale-[0.98]"
                >
                  {loading ? "Signing up..." : "Sign Up"}
                </button>
              </form>
            )}

            {/* Cancel toggle */}
            <div className="text-center">
              <button
                onClick={() => {
                  setShowCancel(!showCancel);
                  setSelectedNight(null);
                  setMessage(null);
                  setCancelFirstName("");
                  setCancelLastInitial("");
                }}
                className="text-sm text-gray-400 hover:text-dart-red transition-colors underline underline-offset-2"
              >
                {showCancel ? "Back to sign up" : "Need to cancel?"}
              </button>
            </div>

            {/* Cancel form */}
            {showCancel && (
              <form
                onSubmit={handleCancel}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4"
              >
                <h3 className="font-bold text-dart-green-dark">Cancel My Spot</h3>
                <div>
                  <label
                    htmlFor="cancel-night"
                    className="block text-sm font-medium text-gray-600 mb-1"
                  >
                    Which night?
                  </label>
                  <select
                    id="cancel-night"
                    value={cancelNight}
                    onChange={(e) => setCancelNight(e.target.value as DayName)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-dart-red focus:outline-none focus:ring-2 focus:ring-dart-red/20"
                  >
                    {CLUB_NIGHTS.map((n) => (
                      <option key={n.day} value={n.day}>
                        {n.day} — {n.yearGroup}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cancel-first-name"
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      First name
                    </label>
                    <input
                      id="cancel-first-name"
                      type="text"
                      required
                      value={cancelFirstName}
                      onChange={(e) =>
                        setCancelFirstName(e.target.value.replace(/[^a-zA-Z\-]/g, ""))
                      }
                      placeholder="e.g. James"
                      className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-dart-red focus:outline-none focus:ring-2 focus:ring-dart-red/20"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cancel-last-initial"
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      Last name initial
                    </label>
                    <select
                      id="cancel-last-initial"
                      required
                      value={cancelLastInitial}
                      onChange={(e) => setCancelLastInitial(e.target.value)}
                      className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-dart-red focus:outline-none focus:ring-2 focus:ring-dart-red/20"
                    >
                      <option value="">--</option>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                        <option key={letter} value={letter}>
                          {letter}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !cancelFirstName.trim() || !cancelLastInitial}
                  className="w-full bg-dart-red hover:bg-dart-red-light text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? "Cancelling..." : "Cancel My Spot"}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <footer className="py-6 text-center">
        <a
          href="/admin"
          className="text-xs text-gray-300 hover:text-gray-400 transition-colors"
        >
          Admin
        </a>
      </footer>
    </main>
  );
}
