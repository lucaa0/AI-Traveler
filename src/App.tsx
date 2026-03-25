/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Calendar, DollarSign, Heart, Sparkles, Loader2, Compass, Clock, CheckCircle2, Ticket, Plane, ArrowRight, Menu, X, LogIn, LogOut } from 'lucide-react';
import { generateItinerary, fetchPlaceImage, TravelParams, Itinerary } from './planner';
import { ProfileView } from './Profile';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, increment, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { Toaster, toast } from 'sonner';
import { handleFirestoreError, OperationType } from './firebase-error';

function PlaceImage({ query, alt, className }: { query: string, alt: string, className?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchPlaceImage(query).then(src => {
      if (isMounted) {
        setImgSrc(src);
        setLoading(false);
      }
    }).catch(err => {
      console.error("Image fetch failed for query:", query, err);
      if (isMounted) {
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [query]);

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
  const [user, setUser] = useState<User | null>(null);
  const [visitedPlaces, setVisitedPlaces] = useState<string[]>([]);

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
          handleFirestoreError(error, OperationType.GET, `userStats/${currentUser.uid}`);
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
            handleFirestoreError(error, OperationType.CREATE, `userStats/${currentUser.uid}`);
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
        await updateDoc(userStatsRef, {
          visitedPlacesList: arrayUnion(countryName),
          visitedCountries: increment(1),
          milesTraveled: increment(Math.floor(Math.random() * 500) + 100) // Simulate miles
        });
        toast.success(`Marked ${destinationName} (${countryName}) as visited!`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `userStats/${user.uid}`);
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
        }
      } catch (e) {
        // Not a JSON string, keep original message
      }
      
      if (!isFirestoreError) {
        setError(errorMessage);
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
          <div className="lg:col-span-5 flex flex-col gap-12 sticky top-32">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Plane className="w-3.5 h-3.5" /> Origin
                  </label>
                  <input
                    type="text"
                    value={params.origin}
                    onChange={(e) => setParams({ ...params, origin: e.target.value })}
                    placeholder="e.g. New York"
                    className="w-full bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-luxury-muted)]/30"
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
                    className="w-full bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-luxury-muted)]/30"
                  />
                </div>
              </div>

              {/* Date, Days & Budget Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Calendar className="w-3.5 h-3.5" /> Departure
                  </label>
                  <input
                    type="date"
                    value={params.date}
                    onChange={(e) => setParams({ ...params, date: e.target.value })}
                    className="w-full bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <Clock className="w-3.5 h-3.5" /> Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={params.days}
                    onChange={(e) => setParams({ ...params, days: parseInt(e.target.value) || 1 })}
                    className="w-full bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-luxury-muted)] mb-2 flex items-center gap-2 transition-colors group-focus-within:text-[var(--color-accent)]">
                    <DollarSign className="w-3.5 h-3.5" /> Tier
                  </label>
                  <select
                    value={params.budget}
                    onChange={(e) => setParams({ ...params, budget: e.target.value as any })}
                    className="w-full bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="Low" className="bg-[var(--color-luxury-bg)]">Essential</option>
                    <option value="Medium" className="bg-[var(--color-luxury-bg)]">Comfort</option>
                    <option value="High" className="bg-[var(--color-luxury-bg)]">Prestige</option>
                  </select>
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
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-luxury-border)] text-sm bg-white/5 backdrop-blur-sm"
                      >
                        {interest}
                        <button
                          type="button"
                          onClick={() => handleRemoveInterest(interest)}
                          className="hover:text-red-400 transition-colors"
                        >
                          &times;
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex gap-4 items-end group">
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
                    className="flex-1 bg-transparent border-b border-[var(--color-luxury-border)] py-2 text-lg focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-luxury-muted)]/30"
                  />
                  <button
                    type="button"
                    onClick={handleAddInterest}
                    className="text-[10px] font-semibold uppercase tracking-[0.15em] pb-2 text-[var(--color-luxury-muted)] hover:text-[var(--color-accent)] transition-colors"
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
                className="w-full mt-8 py-4 px-6 bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)] text-[11px] font-bold uppercase tracking-[0.2em] rounded-full hover:bg-[var(--color-accent)] hover:text-black transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]"
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
                <div className="relative h-[500px] rounded-[2rem] overflow-hidden shadow-2xl">
                  <PlaceImage 
                    query={`${itinerary.destination} city landmark landscape`}
                    alt={itinerary.destination}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-10 md:p-16 text-white w-full">
                    <h2 className="text-5xl md:text-7xl font-serif font-light mb-6 leading-none">
                      {itinerary.destination}
                    </h2>
                    <p className="text-lg md:text-xl font-light text-white/90 max-w-2xl leading-relaxed">
                      {itinerary.summary}
                    </p>
                  </div>
                </div>

                {/* Flights Section */}
                {itinerary.flightDetails && (
                  <div className="mt-16 border-t border-[var(--color-luxury-border)] pt-16">
                    <h3 className="text-3xl font-serif mb-10 flex items-center gap-4">
                      <Plane className="w-8 h-8 opacity-50" />
                      Flight Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 border border-[var(--color-luxury-border)] rounded-2xl bg-white/5 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-4 text-[var(--color-luxury-muted)]">
                          <Plane className="w-4 h-4" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Outbound Flight</span>
                        </div>
                        <p className="text-[var(--color-luxury-ink)] leading-relaxed">{itinerary.flightDetails.outbound}</p>
                      </div>
                      <div className="p-6 border border-[var(--color-luxury-border)] rounded-2xl bg-white/5 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-4 text-[var(--color-luxury-muted)]">
                          <Plane className="w-4 h-4 rotate-180" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Return Flight</span>
                        </div>
                        <p className="text-[var(--color-luxury-ink)] leading-relaxed">{itinerary.flightDetails.return}</p>
                      </div>
                    </div>
                    <div className="mt-6 inline-flex items-center gap-3 px-6 py-3 border border-[var(--color-luxury-border)] rounded-full bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)]">
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm font-medium tracking-wide">Estimated Total Cost: {itinerary.flightDetails.estimatedCost}</span>
                    </div>
                  </div>
                )}

                {/* Days */}
                <div className="space-y-24 mt-16">
                  {itinerary.days.map((day, index) => (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-100px" }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      key={day.day}
                      className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start"
                    >
                      {/* Day Image */}
                      <div className={`md:col-span-5 ${index % 2 !== 0 ? 'md:order-2' : ''}`}>
                        <div className="sticky top-32">
                          <div className="aspect-[3/4] rounded-2xl overflow-hidden">
                            <PlaceImage 
                              query={`${day.imageKeyword} ${itinerary.destination}`}
                              alt={day.theme}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000"
                            />
                          </div>
                          <div className="mt-6">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-luxury-muted)]">
                              Day 0{day.day}
                            </span>
                            <h3 className="text-2xl font-serif mt-2">{day.theme}</h3>
                          </div>
                        </div>
                      </div>

                      {/* Day Activities */}
                      <div className={`md:col-span-7 ${index % 2 !== 0 ? 'md:order-1' : ''}`}>
                        <div className="space-y-12 mt-8 md:mt-0">
                          {day.activities.map((activity, actIndex) => (
                            <div key={actIndex} className="relative pl-8 border-l border-[var(--color-luxury-border)] pb-12 last:pb-0">
                              <div className="absolute left-0 top-0 w-2 h-2 -translate-x-[5px] rounded-full bg-[var(--color-luxury-ink)]" />
                              <div className="flex flex-col xl:flex-row gap-6">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-luxury-muted)]">
                                      {activity.time}
                                    </span>
                                    <span className="text-[11px] font-medium tracking-wider border border-[var(--color-luxury-border)] px-3 py-1 rounded-full">
                                      {activity.costEstimate}
                                    </span>
                                  </div>
                                  <h4 className="text-xl font-serif mb-3">{activity.title}</h4>
                                  <p className="text-[var(--color-luxury-ink)]/70 leading-relaxed font-light mb-6">
                                    {activity.description}
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    <a href={activity.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-luxury-border)] px-4 py-2 rounded-full hover:bg-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-bg)] transition-colors">
                                      <MapPin className="w-3 h-3" /> View on Maps
                                    </a>
                                    {activity.ticketUrl && activity.ticketUrl.trim() !== '' && (
                                      <a href={activity.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-luxury-border)] px-4 py-2 rounded-full hover:bg-[var(--color-luxury-ink)] hover:text-[var(--color-luxury-bg)] transition-colors">
                                        <Ticket className="w-3 h-3" /> Get Tickets
                                      </a>
                                    )}
                                  </div>
                                </div>
                                <div className="w-full xl:w-56 aspect-[4/3] rounded-xl overflow-hidden shrink-0 shadow-md">
                                  <PlaceImage
                                    query={`${activity.title} ${itinerary.destination}`}
                                    alt={activity.title}
                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Tips */}
                <div className="mt-24 border-t border-[var(--color-luxury-border)] pt-16">
                  <h3 className="text-3xl font-serif mb-10 text-center">Curator's Notes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {itinerary.tips.map((tip, index) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                        key={index} 
                        className="p-8 glass-panel rounded-2xl hover:bg-white/[0.04] transition-colors"
                      >
                        <CheckCircle2 className="w-6 h-6 mb-4 text-[var(--color-accent)]/80" strokeWidth={1.5} />
                        <p className="text-sm leading-relaxed text-[var(--color-luxury-ink)]/80">{tip}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
                
                {/* Mark Destination as Visited */}
                <div className="mt-16 text-center">
                  <button 
                    onClick={() => handleMarkDestinationVisited(itinerary.destination, itinerary.country)}
                    disabled={visitedPlaces.includes(itinerary.country)}
                    className={`inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] font-semibold border border-[var(--color-luxury-border)] px-8 py-4 rounded-full transition-colors ${
                      visitedPlaces.includes(itinerary.country) 
                        ? 'bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)] opacity-50 cursor-not-allowed' 
                        : 'hover:bg-[var(--color-accent)] hover:text-[#0f0f0f]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> {visitedPlaces.includes(itinerary.country) ? 'Destination Visited' : 'Mark Destination as Visited'}
                  </button>
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
