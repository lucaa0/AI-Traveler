/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Calendar, DollarSign, Heart, Sparkles, Loader2, Compass, Clock, CheckCircle2, Ticket, Plane, ArrowRight, Menu, X, LogIn, LogOut, ChevronDown, Minus, Plus, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { generateItinerary, fetchPlaceImage, TravelParams, Itinerary } from './planner';
import { ProfileView } from './Profile';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, increment, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { Toaster, toast } from 'sonner';
import { handleFirestoreError, OperationType } from './firebase-error';

function PlaceImage({ placeName, destination, alt, className, imagePrompt }: { placeName: string, destination: string, alt: string, className?: string, imagePrompt?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchPlaceImage(placeName, destination, imagePrompt).then(src => {
      if (isMounted) {
        setImgSrc(src);
        setLoading(false);
      }
    }).catch(err => {
      console.error("Image fetch failed for:", placeName, destination, err);
      if (isMounted) {
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [placeName, destination, imagePrompt]);

  if (loading) {
    return (
      <div className={`bg-[var(--color-luxury-surface)] flex items-center justify-center overflow-hidden relative ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
        <Compass className="w-6 h-6 animate-pulse text-[var(--color-luxury-muted)]/50" />
      </div>
    );
  }
  if (!imgSrc) {
    return <div className={`bg-[var(--color-luxury-surface)] flex items-center justify-center text-[var(--color-luxury-muted)] text-xs text-center p-4 border border-[var(--color-luxury-border)] ${className}`}>Image unavailable</div>;
  }

  return (
    <motion.img 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      src={imgSrc} 
      alt={alt} 
      className={className} 
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

export default function App() {
  const [params, setParams] = useState<TravelParams>({
    origin: '',
    destination: '',
    date: '',
    budget: 'Medium',
    days: 3,
    interests: [],
  });
  const [interestInput, setInterestInput] = useState('');
  const [loadingState, setLoadingState] = useState('');
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [error, setError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'profile'>('home');
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [visitedPlaces, setVisitedPlaces] = useState<string[]>([]);
  const [isTierOpen, setIsTierOpen] = useState(false);
  const [isDaysOpen, setIsDaysOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        let docExists = false;
        try {
          const userStatsRef = doc(db, 'userStats', currentUser.uid);
          const docSnap = await getDoc(userStatsRef);
          docExists = docSnap.exists();
        } catch (error) {
          try {
            handleFirestoreError(error, OperationType.GET, `userStats/${currentUser.uid}`);
          } catch (e) {
            // Error is already displayed via toast in handleFirestoreError
          }
        }

        if (!docExists) {
          try {
            const userStatsRef = doc(db, 'userStats', currentUser.uid);
            await setDoc(userStatsRef, {
              uid: currentUser.uid,
              visitedCountries: 0,
              visitedCities: 0,
              milesTraveled: 0,
              visitedPlacesList: []
            });
          } catch (error) {
            try {
              handleFirestoreError(error, OperationType.CREATE, `userStats/${currentUser.uid}`);
            } catch (e) {
              // Error is already displayed via toast in handleFirestoreError
            }
          }
        }
      } else {
        setVisitedPlaces([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userStatsRef = doc(db, 'userStats', user.uid);
    const unsubscribe = onSnapshot(userStatsRef, (doc) => {
      if (doc.exists()) {
        setVisitedPlaces(doc.data().visitedPlacesList || []);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `userStats/${user.uid}`);
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Successfully logged in');
    } catch (err) {
      console.error("Login failed:", err);
      toast.error('Failed to log in');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('home');
      toast.success('Successfully logged out');
    } catch (err) {
      console.error("Logout failed:", err);
      toast.error('Failed to log out');
    }
  };

  const handleMarkDestinationVisited = async (destinationName: string, countryName: string) => {
    if (!user) {
      toast.error("Please log in to mark destination as visited.");
      return;
    }
    try {
      const userStatsRef = doc(db, 'userStats', user.uid);
      if (!visitedPlaces.includes(countryName)) {
        await setDoc(userStatsRef, {
          uid: user.uid,
          visitedPlacesList: arrayUnion(countryName),
          visitedCountries: increment(1),
          milesTraveled: increment(Math.floor(Math.random() * 500) + 100) // Simulate miles
        }, { merge: true });
        toast.success(`Marked ${destinationName} (${countryName}) as visited!`);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `userStats/${user.uid}`);
      } catch (e) {
        // Error is already displayed via toast in handleFirestoreError
      }
    }
  };

  const handleAddInterest = () => {
    if (interestInput.trim() && !params.interests.includes(interestInput.trim())) {
      setParams({ ...params, interests: [...params.interests, interestInput.trim()] });
      setInterestInput('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setParams({ ...params, interests: params.interests.filter((i) => i !== interest) });
  };

  const handleUpdateNotes = (dayIndex: number, activityIndex: number, notes: string) => {
    if (!itinerary) return;
    const newItinerary = { ...itinerary };
    newItinerary.days[dayIndex].activities[activityIndex].notes = notes;
    setItinerary(newItinerary);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!params.origin || !params.destination || !params.date) {
      setError('Please enter an origin, destination, and travel date.');
      return;
    }
    setError('');
    setLoadingState('Initializing agents...');
    setItinerary(null);
    try {
      const result = await generateItinerary(params, (status) => {
        setLoadingState(status);
      });
      setItinerary(result);

      if (user) {
        try {
          await addDoc(collection(db, 'itineraries'), {
            userId: user.uid,
            destination: result.destination,
            country: result.country,
            createdAt: Date.now(),
            itineraryData: JSON.stringify(result)
          });
          toast.success('Itinerary saved to your profile.');
        } catch (saveErr) {
          handleFirestoreError(saveErr, OperationType.CREATE, 'itineraries');
        }
      }
    } catch (err: any) {
      let errorMessage = err.message || 'Failed to generate itinerary. Please try again.';
      let isFirestoreError = false;
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error) {
          isFirestoreError = true;
          errorMessage = `Database Error: ${parsed.error}`;
        }
      } catch (e) {
        // Not a JSON string, keep original message
      }
      
      setError(errorMessage);
      if (!isFirestoreError) {
        toast.error(errorMessage);
      }
    } finally {
      setLoadingState('');
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-[#D4AF37] selection:text-[#0f0f0f]">
      <Toaster position="bottom-right" toastOptions={{
        className: 'bg-[var(--color-luxury-bg)] text-[var(--color-luxury-ink)] border border-[var(--color-luxury-border)] rounded-2xl shadow-xl font-sans',
      }} />
      {/* Header */}
      <header className="border-b border-[var(--color-luxury-border)] sticky top-0 z-20 bg-[var(--color-luxury-bg)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => { setCurrentView('home'); setItinerary(null); }}
          >
            <Compass className="w-6 h-6 text-[var(--color-luxury-ink)]" strokeWidth={1.5} />
            <h1 className="text-2xl font-serif tracking-tight">Lumina Travel</h1>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <button 
                onClick={handleLogout}
                className="hidden md:flex items-center gap-2 text-xs uppercase tracking-[0.1em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-muted)] transition-colors"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="hidden md:flex items-center gap-2 text-xs uppercase tracking-[0.1em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-muted)] transition-colors"
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
            )}
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 -mr-2 text-[var(--color-luxury-ink)] hover:bg-[var(--color-luxury-border)]/30 rounded-full transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Navigation Menu Dropdown */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-20 left-0 w-full bg-[var(--color-luxury-bg)]/95 backdrop-blur-xl border-b border-[var(--color-luxury-border)] shadow-2xl py-8 px-6 lg:px-12 flex flex-col gap-6 z-10"
            >
              <button onClick={() => { setCurrentView('home'); setItinerary(null); setIsMenuOpen(false); }} className="text-left text-sm uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-accent)] transition-colors">New Journey</button>
              <button onClick={() => { setCurrentView('profile'); setIsMenuOpen(false); }} className="text-left text-sm uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-accent)] transition-colors">Saved Itineraries</button>
              <button onClick={() => { setCurrentView('profile'); setIsMenuOpen(false); }} className="text-left text-sm uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-accent)] transition-colors">Profile</button>
              {user ? (
                <button onClick={() => { handleLogout(); setIsMenuOpen(false); }} className="md:hidden text-left text-sm uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-accent)] transition-colors">Logout</button>
              ) : (
                <button onClick={() => { handleLogin(); setIsMenuOpen(false); }} className="md:hidden text-left text-sm uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-ink)] hover:text-[var(--color-accent)] transition-colors">Login</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-6 lg:px-12 py-12 lg:py-20">
        <AnimatePresence mode="wait">
          {currentView === 'home' ? (
          <motion.div 
            key="home"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24"
        >
          
          {/* Form Section */}
          <div className="lg:col-span-5 flex flex-col gap-12 lg:sticky lg:top-32">
            <div className="space-y-6">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.8 }}
                className="text-6xl md:text-7xl lg:text-8xl font-serif font-light tracking-tighter leading-[0.9] text-balance"
              >
                Curate Your <br/><span className="italic text-[var(--color-luxury-muted)]">Escape.</span>
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-[var(--color-luxury-muted)] text-lg max-w-md font-light"
              >
                Design a bespoke itinerary tailored to your unique tastes, driven by intelligent curation.
              </motion.p>
            </div>
            
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              onSubmit={handleSubmit} 
              className="glass-panel p-8 md:p-10 rounded-3xl space-y-8"
            >
              {/* Origin & Destination */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Plane className="w-3.5 h-3.5" /> Origin
                  </label>
                  <input
                    type="text"
                    value={params.origin}
                    onChange={(e) => setParams({ ...params, origin: e.target.value })}
                    placeholder="e.g. New York"
                    className="w-full bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all placeholder:text-[var(--color-luxury-muted)]/30"
                  />
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <MapPin className="w-3.5 h-3.5" /> Destination
                  </label>
                  <input
                    type="text"
                    value={params.destination}
                    onChange={(e) => setParams({ ...params, destination: e.target.value })}
                    placeholder="e.g. Kyoto, Japan"
                    className="w-full bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all placeholder:text-[var(--color-luxury-muted)]/30"
                  />
                </div>
              </div>

              {/* Date, Days & Budget Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Calendar className="w-3.5 h-3.5" /> Departure
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                      className="w-full bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg text-left flex justify-between items-center focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all"
                    >
                      <span className={params.date ? "text-[var(--color-luxury-ink)]" : "text-[var(--color-luxury-muted)]/30"}>
                        {params.date ? new Date(params.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date'}
                      </span>
                      <Calendar className={`w-4 h-4 transition-colors ${isCalendarOpen ? 'text-[var(--color-accent)]' : 'text-[var(--color-luxury-muted)]'}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isCalendarOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-full left-0 mt-2 p-5 bg-[#1a1a1a] border border-[var(--color-luxury-border)] rounded-2xl z-50 shadow-2xl backdrop-blur-xl w-[300px]"
                        >
                          {/* Calendar Header */}
                          <div className="flex justify-between items-center mb-6">
                            <button 
                              type="button" 
                              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                              className="p-2 hover:bg-white/5 rounded-full hover:text-[var(--color-accent)] transition-colors"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="font-serif text-lg text-[var(--color-luxury-ink)]">
                              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                              className="p-2 hover:bg-white/5 rounded-full hover:text-[var(--color-accent)] transition-colors"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                          
                          {/* Calendar Grid */}
                          <div className="grid grid-cols-7 gap-1 text-center mb-3">
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                              <div key={day} className="text-[10px] uppercase tracking-wider text-[var(--color-luxury-muted)] font-semibold py-1">
                                {day}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-y-2 gap-x-1">
                            {Array.from({ length: getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }).map((_, i) => (
                              <div key={`empty-${i}`} className="p-2" />
                            ))}
                            {Array.from({ length: getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const isSelected = params.date === dateStr;
                              const isPast = new Date(dateStr + 'T00:00:00') < new Date(new Date().setHours(0,0,0,0));
                              
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  disabled={isPast}
                                  onClick={() => {
                                    setParams({ ...params, date: dateStr });
                                    setIsCalendarOpen(false);
                                  }}
                                  className={`text-sm rounded-full w-9 h-9 flex items-center justify-center mx-auto transition-all ${
                                    isSelected 
                                      ? 'bg-gradient-to-br from-[var(--color-accent)] to-[#F3E5AB] text-[#0f0f0f] font-bold shadow-[0_0_10px_rgba(212,175,55,0.4)]' 
                                      : isPast 
                                        ? 'text-[var(--color-luxury-muted)]/20 cursor-not-allowed' 
                                        : 'text-[var(--color-luxury-ink)] hover:bg-white/10 hover:text-[var(--color-accent)]'
                                  }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Clock className="w-3.5 h-3.5" /> Duration
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDaysOpen(!isDaysOpen)}
                      className="w-full bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg text-left flex justify-between items-center focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all"
                    >
                      <span className="text-[var(--color-luxury-ink)]">
                        {params.days} {params.days === 1 ? 'Day' : 'Days'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-[var(--color-luxury-muted)] transition-transform duration-300 ${isDaysOpen ? 'rotate-180 text-[var(--color-accent)]' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isDaysOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-[var(--color-luxury-border)] rounded-xl overflow-hidden z-50 shadow-2xl backdrop-blur-xl max-h-60 overflow-y-auto"
                        >
                          {Array.from({ length: 14 }, (_, i) => i + 1).map((day) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setParams({ ...params, days: day });
                                setIsDaysOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 transition-colors ${
                                params.days === day 
                                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' 
                                  : 'text-[var(--color-luxury-muted)] hover:bg-white/[0.05] hover:text-[var(--color-luxury-ink)]'
                              }`}
                            >
                              {day} {day === 1 ? 'Day' : 'Days'}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <DollarSign className="w-3.5 h-3.5" /> Tier
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsTierOpen(!isTierOpen)}
                      className="w-full bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg text-left flex justify-between items-center focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all"
                    >
                      <span className="text-[var(--color-luxury-ink)]">
                        {params.budget === 'Low' ? 'Essential' : params.budget === 'Medium' ? 'Comfort' : 'Prestige'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-[var(--color-luxury-muted)] transition-transform duration-300 ${isTierOpen ? 'rotate-180 text-[var(--color-accent)]' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isTierOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-[var(--color-luxury-border)] rounded-xl overflow-hidden z-50 shadow-2xl backdrop-blur-xl"
                        >
                          {[
                            { value: 'Low', label: 'Essential' },
                            { value: 'Medium', label: 'Comfort' },
                            { value: 'High', label: 'Prestige' }
                          ].map((tier) => (
                            <button
                              key={tier.value}
                              type="button"
                              onClick={() => {
                                setParams({ ...params, budget: tier.value as any });
                                setIsTierOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 transition-colors ${
                                params.budget === tier.value 
                                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' 
                                  : 'text-[var(--color-luxury-muted)] hover:bg-white/[0.05] hover:text-[var(--color-luxury-ink)]'
                              }`}
                            >
                              {tier.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Interests */}
              <div className="space-y-4">
                <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] flex items-center gap-2">
                  <Heart className="w-3.5 h-3.5" /> Preferences
                </label>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {params.interests.map((interest) => (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        key={interest}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-accent)]/50 text-sm bg-[var(--color-accent)]/10 text-[var(--color-accent)] backdrop-blur-sm"
                      >
                        {interest}
                        <button
                          type="button"
                          onClick={() => handleRemoveInterest(interest)}
                          className="hover:text-white transition-colors"
                        >
                          &times;
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex gap-4 items-center group">
                  <input
                    type="text"
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddInterest();
                      }
                    }}
                    placeholder="e.g. Fine Dining, Art"
                    className="flex-1 bg-white/[0.02] border border-[var(--color-luxury-border)] rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.04] transition-all placeholder:text-[var(--color-luxury-muted)]/30"
                  />
                  <button
                    type="button"
                    onClick={handleAddInterest}
                    className="px-6 py-3 bg-white/[0.05] border border-[var(--color-luxury-border)] rounded-xl text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-ink)] hover:bg-white/[0.1] hover:border-[var(--color-accent)] transition-all"
                  >
                    Add
                  </button>
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border border-red-900/50 text-red-400 text-sm bg-red-950/20 rounded-xl">
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={!!loadingState}
                className="w-full mt-8 py-5 px-6 bg-gradient-to-r from-[var(--color-luxury-ink)] to-[#a3a3a3] text-[var(--color-luxury-bg)] text-[12px] font-bold uppercase tracking-[0.2em] rounded-xl hover:from-[var(--color-accent)] hover:to-[#F3E5AB] hover:text-[#0f0f0f] transition-all duration-500 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] transform hover:-translate-y-1"
              >
                {loadingState ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {loadingState}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Reveal Itinerary
                  </>
                )}
              </button>
            </motion.form>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-7">
            {loadingState ? (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center text-[var(--color-luxury-muted)] space-y-8 relative overflow-hidden rounded-[2rem] glass-panel">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-accent)_0%,transparent_70%)] opacity-5 animate-pulse" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="relative mb-8">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                      className="w-24 h-24 rounded-full border border-dashed border-[var(--color-accent)]/30"
                    />
                    <motion.div 
                      animate={{ rotate: -360 }}
                      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-2 rounded-full border border-[var(--color-luxury-border)]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-[var(--color-accent)] animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] font-semibold text-[var(--color-luxury-ink)]">
                      Multi-Agent Orchestration
                    </p>
                    <motion.p 
                      key={loadingState}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-serif italic text-[var(--color-accent)]"
                    >
                      {loadingState}
                    </motion.p>
                  </div>
                </div>
              </div>
            ) : itinerary ? (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-16"
              >
                {/* Hero Destination */}
                <div className="relative h-[600px] md:h-[700px] rounded-[2.5rem] overflow-hidden shadow-2xl group">
                  <PlaceImage 
                    placeName={`${itinerary.destination} city landmark landscape`}
                    destination={itinerary.country}
                    alt={itinerary.destination}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-[2s] ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-10 md:p-20 text-white w-full">
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1, delay: 0.2 }}
                    >
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-[1px] w-12 bg-white/50" />
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                          Curated Journey
                        </span>
                      </div>
                      <h2 className="text-6xl md:text-8xl font-serif font-light mb-8 leading-none tracking-tight">
                        {itinerary.destination}
                      </h2>
                      <p className="text-lg md:text-2xl font-light text-white/90 max-w-3xl leading-relaxed">
                        {itinerary.summary}
                      </p>
                    </motion.div>
                  </div>
                </div>

                {/* Flights Section */}
                {itinerary.flightDetails && (
                  <div className="mt-24 border-t border-[var(--color-luxury-border)] pt-20">
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                      <div>
                        <div className="flex items-center gap-4 mb-4">
                          <Plane className="w-5 h-5 text-[var(--color-accent)]" />
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-luxury-muted)]">Logistics</span>
                        </div>
                        <h3 className="text-4xl font-serif">Flight Arrangements</h3>
                      </div>
                      <div className="inline-flex items-center gap-3 px-8 py-4 border border-[var(--color-luxury-border)] rounded-full bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)] shadow-xl">
                        <DollarSign className="w-5 h-5 text-[var(--color-accent)]" />
                        <span className="text-sm font-medium tracking-widest uppercase">Est. Total: {itinerary.flightDetails.estimatedCost}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <motion.div 
                        whileHover={{ y: -5 }}
                        className="p-8 border border-[var(--color-luxury-border)] rounded-3xl bg-[var(--color-luxury-surface)] shadow-lg transition-all duration-300"
                      >
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-10 h-10 rounded-full bg-[var(--color-luxury-ink)]/5 flex items-center justify-center">
                            <Plane className="w-5 h-5 text-[var(--color-luxury-ink)]" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)]">Outbound Journey</span>
                        </div>
                        <p className="text-[var(--color-luxury-ink)] leading-relaxed text-lg font-light">{itinerary.flightDetails.outbound}</p>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ y: -5 }}
                        className="p-8 border border-[var(--color-luxury-border)] rounded-3xl bg-[var(--color-luxury-surface)] shadow-lg transition-all duration-300"
                      >
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-10 h-10 rounded-full bg-[var(--color-luxury-ink)]/5 flex items-center justify-center">
                            <Plane className="w-5 h-5 text-[var(--color-luxury-ink)] rotate-180" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)]">Return Journey</span>
                        </div>
                        <p className="text-[var(--color-luxury-ink)] leading-relaxed text-lg font-light">{itinerary.flightDetails.return}</p>
                      </motion.div>
                    </div>
                  </div>
                )}

                {/* Days Pagination */}
                <div className="mt-24">
                  <div className="flex flex-col sm:flex-row items-center justify-between mb-16 border-b border-[var(--color-luxury-border)] pb-8 gap-6">
                    <button 
                      onClick={() => { setCurrentDayIndex(Math.max(0, currentDayIndex - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      disabled={currentDayIndex === 0}
                      className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-muted)] hover:text-[var(--color-luxury-ink)] disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous Day
                    </button>
                    <span className="text-xl font-serif tracking-widest text-[var(--color-accent)] order-first sm:order-none">
                      Day {currentDayIndex + 1} / {itinerary.days.length}
                    </span>
                    <button 
                      onClick={() => { setCurrentDayIndex(Math.min(itinerary.days.length - 1, currentDayIndex + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      disabled={currentDayIndex === itinerary.days.length - 1}
                      className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-semibold text-[var(--color-luxury-muted)] hover:text-[var(--color-luxury-ink)] disabled:opacity-30 transition-colors"
                    >
                      Next Day <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <motion.div
                    key={currentDayIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="max-w-4xl mx-auto px-4 md:px-0"
                  >
                    <div className="mb-12 text-center">
                      <h3 className="text-3xl md:text-4xl font-serif mb-4">{itinerary.days[currentDayIndex].theme}</h3>
                    </div>

                    {/* Day Activities */}
                    <div className="space-y-12">
                      {itinerary.days[currentDayIndex].activities.map((activity, actIndex) => (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.5, delay: actIndex * 0.1 }}
                          key={actIndex} 
                          className="relative pl-6 md:pl-8 border-l border-[var(--color-luxury-border)] pb-12 last:pb-0 group"
                        >
                          <div className="absolute left-0 top-0 w-3 h-3 -translate-x-[6.5px] rounded-full bg-[var(--color-luxury-bg)] border-2 border-[var(--color-luxury-ink)] group-hover:bg-[var(--color-luxury-ink)] transition-colors duration-300" />
                          <div className="flex flex-col gap-6">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] flex items-center gap-2">
                                  <Clock className="w-3 h-3" /> {activity.time}
                                </span>
                                <span className="text-[10px] font-medium tracking-wider border border-[var(--color-luxury-border)] px-3 py-1 rounded-full bg-[var(--color-luxury-surface)]">
                                  {activity.costEstimate}
                                </span>
                              </div>
                              <h4 className="text-xl md:text-2xl font-serif mb-3 group-hover:text-[var(--color-accent)] transition-colors duration-300">{activity.title}</h4>
                              <p className="text-[var(--color-luxury-ink)]/70 leading-relaxed font-light mb-6 text-sm">
                                {activity.description}
                              </p>
                              
                              {activity.insight && (
                                <div className="mb-6 bg-[var(--color-luxury-surface)] p-4 rounded-xl border border-[var(--color-luxury-border)]/50 flex gap-3 items-start">
                                  <Lightbulb className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
                                  <p className="text-xs leading-relaxed text-[var(--color-luxury-ink)]/80 italic">
                                    <span className="font-semibold not-italic block mb-1 text-[10px] uppercase tracking-wider">Curator's Insight</span>
                                    {activity.insight}
                                  </p>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-3">
                                <a href={activity.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-luxury-border)] px-4 py-2 rounded-full hover:bg-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-bg)] transition-all duration-300">
                                  <MapPin className="w-3 h-3" /> View on Maps
                                </a>
                                {activity.ticketUrl && activity.ticketUrl.trim() !== '' && (
                                  <a href={activity.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-luxury-border)] px-4 py-2 rounded-full hover:bg-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-bg)] transition-all duration-300">
                                    <Ticket className="w-3 h-3" /> Get Tickets
                                  </a>
                                )}
                              </div>
                              <div className="mt-6">
                                <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 block">Personal Notes</label>
                                <textarea
                                  value={activity.notes}
                                  onChange={(e) => handleUpdateNotes(currentDayIndex, actIndex, e.target.value)}
                                  placeholder="Add your personal notes or preferences here..."
                                  className="w-full bg-[var(--color-luxury-surface)] border border-[var(--color-luxury-border)] rounded-xl p-4 text-sm text-[var(--color-luxury-ink)] placeholder-[var(--color-luxury-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all"
                                  rows={3}
                                />
                              </div>
                            </div>
                            <div className="w-full aspect-[16/9] md:aspect-[4/3] rounded-xl overflow-hidden shrink-0 shadow-lg group-hover:shadow-xl transition-shadow duration-500">
                              <PlaceImage
                                placeName={activity.placeName || activity.title}
                                destination={itinerary.destination}
                                imagePrompt={activity.imagePrompt}
                                alt={activity.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </div>

                {/* Tips */}
                <div className="mt-32 border-t border-[var(--color-luxury-border)] pt-24 pb-12">
                  <div className="text-center mb-16">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-luxury-ink)]/5 mb-6">
                      <Sparkles className="w-5 h-5 text-[var(--color-accent)]" />
                    </div>
                    <h3 className="text-4xl font-serif mb-4">Curator's Notes</h3>
                    <p className="text-[var(--color-luxury-muted)] uppercase tracking-[0.2em] text-xs font-semibold">Essential insights for your journey</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {itinerary.tips.map((tip, index) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                        key={index} 
                        className="p-8 border border-[var(--color-luxury-border)] bg-[var(--color-luxury-surface)] rounded-3xl hover:shadow-xl transition-all duration-300 group"
                      >
                        <CheckCircle2 className="w-6 h-6 mb-6 text-[var(--color-luxury-muted)] group-hover:text-[var(--color-accent)] transition-colors duration-300" strokeWidth={1.5} />
                        <p className="text-sm leading-relaxed text-[var(--color-luxury-ink)]/80">{tip}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
                
                {/* Mark Destination as Visited */}
                <div className="mt-24 text-center pb-20">
                  <motion.button 
                    whileHover={!visitedPlaces.includes(itinerary.country) ? { scale: 1.02 } : {}}
                    whileTap={!visitedPlaces.includes(itinerary.country) ? { scale: 0.98 } : {}}
                    onClick={() => handleMarkDestinationVisited(itinerary.destination, itinerary.country)}
                    disabled={visitedPlaces.includes(itinerary.country)}
                    className={`inline-flex items-center gap-3 text-xs uppercase tracking-[0.2em] font-semibold border px-10 py-5 rounded-full transition-all duration-500 shadow-lg ${
                      visitedPlaces.includes(itinerary.country) 
                        ? 'border-[var(--color-luxury-border)] bg-[var(--color-luxury-surface)] text-[var(--color-luxury-muted)] cursor-not-allowed' 
                        : 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" /> {visitedPlaces.includes(itinerary.country) ? 'Destination Conquered' : 'Mark as Visited'}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="h-full min-h-[600px] flex flex-col items-center justify-center text-[var(--color-luxury-muted)] glass-panel rounded-[2rem] p-12 text-center"
              >
                <div className="w-24 h-24 rounded-full border border-[var(--color-luxury-border)] flex items-center justify-center mb-8 bg-white/[0.02]">
                  <Compass className="w-10 h-10 opacity-40" strokeWidth={1} />
                </div>
                <p className="text-sm uppercase tracking-[0.3em] font-semibold text-[var(--color-luxury-ink)] mb-4">Awaiting Directives</p>
                <p className="text-sm max-w-sm opacity-70 leading-relaxed">
                  Provide your destination and preferences to receive a bespoke, intelligently curated travel itinerary.
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
        ) : currentView === 'profile' ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <ProfileView onViewItinerary={(itinerary) => {
              setItinerary(itinerary);
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }} />
          </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
