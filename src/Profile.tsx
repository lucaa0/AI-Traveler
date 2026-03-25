import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firebase-error';
import { Trash2, Eye } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Itinerary } from './planner';
import { ComposableMap, Geographies, Geography, Sphere, Graticule } from "react-simple-maps";

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

// Deterministic hash function to map a string to a country index (0 to 176)
export function WorldMap({ visitedPlaces }: { visitedPlaces: string[] }) {
  const [tooltip, setTooltip] = useState<{ name: string; places: string[]; x: number; y: number } | null>(null);

  const isVisited = (geoName: string) => {
    const normalizedGeoName = geoName.toLowerCase();
    return visitedPlaces.some(place => 
      place.toLowerCase() === normalizedGeoName ||
      (normalizedGeoName.includes('united states') && place.toLowerCase().includes('united states')) ||
      (normalizedGeoName.includes('italy') && place.toLowerCase().includes('italy'))
    );
  };

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center z-0">
      <ComposableMap
        projectionConfig={{
          scale: 170,
          center: [0, 10]
        }}
        className="w-full h-full object-contain opacity-100 drop-shadow-2xl"
      >
        <Sphere stroke="#2a2a2a" strokeWidth={0.5} id="sphere" fill="transparent" />
        <Graticule stroke="#1f1f1f" strokeWidth={0.5} />
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const isExplored = isVisited(geo.properties.name);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isExplored ? "#D4AF37" : "#383838"}
                  stroke="#0f0f0f"
                  strokeWidth={0.75}
                  className={isExplored ? "explored-country" : ""}
                  onMouseEnter={(e) => {
                    setTooltip({
                      name: geo.properties.name || "Unknown Region",
                      places: isExplored ? visitedPlaces.filter(p => isVisited(geo.properties.name)) : [],
                      x: e.clientX,
                      y: e.clientY
                    });
                  }}
                  onMouseMove={(e) => {
                    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                  }}
                  onMouseLeave={() => {
                    setTooltip(null);
                  }}
                  style={{
                    default: { outline: "none", transition: "all 0.3s" },
                    hover: { fill: isExplored ? "#F3E5AB" : "#4a4a4a", outline: "none", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {tooltip && (
        <div 
          className="fixed z-50 pointer-events-none bg-[var(--color-luxury-bg)]/95 backdrop-blur-xl border border-[var(--color-luxury-border)] px-5 py-4 rounded-2xl shadow-2xl transform -translate-x-1/2 -translate-y-full mt-[-20px] min-w-[160px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className={`font-serif text-xl mb-1 ${tooltip.places.length > 0 ? 'text-[#D4AF37]' : 'text-[var(--color-luxury-ink)]'}`}>
            {tooltip.name}
          </p>
          {tooltip.places.length > 0 ? (
            <div className="flex flex-col gap-2 mt-3">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold border-b border-[var(--color-luxury-border)] pb-1">Visited Locations</p>
              <div className="flex flex-col gap-1.5">
                {tooltip.places.slice(0, 3).map((p, i) => (
                  <p key={i} className="text-xs text-[var(--color-luxury-ink)] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] opacity-80" /> {p}
                  </p>
                ))}
                {tooltip.places.length > 3 && (
                  <p className="text-[10px] text-[var(--color-luxury-muted)] italic mt-1">
                    + {tooltip.places.length - 3} more
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold mt-1">Unexplored Territory</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileView({ onViewItinerary }: { onViewItinerary: (itinerary: Itinerary) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    visitedCountries: 0,
    visitedCities: 0,
    milesTraveled: 0,
    visitedPlacesList: [] as string[]
  });
  const [savedItineraries, setSavedItineraries] = useState<{ id: string, destination: string, country?: string, createdAt: number, itineraryData: string }[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userStatsRef = doc(db, 'userStats', user.uid);
    const unsubscribeStats = onSnapshot(userStatsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats({
          visitedCountries: data.visitedCountries || 0,
          visitedCities: data.visitedCities || 0,
          milesTraveled: data.milesTraveled || 0,
          visitedPlacesList: data.visitedPlacesList || []
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `userStats/${user.uid}`);
    });

    const itinerariesQuery = query(
      collection(db, 'itineraries'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeItineraries = onSnapshot(itinerariesQuery, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({
        id: doc.id,
        destination: doc.data().destination,
        country: doc.data().country,
        createdAt: doc.data().createdAt,
        itineraryData: doc.data().itineraryData
      }));
      setSavedItineraries(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'itineraries');
    });

    return () => {
      unsubscribeStats();
      unsubscribeItineraries();
    };
  }, [user]);

  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'itineraries', id));
      toast.success('Itinerary deleted successfully.');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `itineraries/${id}`);
      } catch (e) {
        // Error is already displayed via toast in handleFirestoreError
      }
    }
  };

  const allVisitedPlaces = Array.from(new Set([
    ...stats.visitedPlacesList,
    ...savedItineraries.map(trip => trip.country || trip.destination.split(',').pop()?.trim() || trip.destination)
  ]));

  if (!user) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <h2 className="text-3xl font-serif mb-4 text-[var(--color-luxury-ink)]">Authentication Required</h2>
        <p className="text-[var(--color-luxury-muted)] max-w-md">
          Please log in to view your personalized travel profile and track your global exploration.
        </p>
      </motion.div>
    );
  }

  const explorationPercentage = Math.min(100, Math.round((stats.visitedCities / 100) * 100));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      className="flex flex-col items-center justify-center py-8 lg:py-12 w-full"
    >
      <div className="text-center mb-16">
        <h2 className="text-5xl lg:text-6xl font-serif mb-6 text-[var(--color-luxury-ink)] tracking-tight">Your Travel Profile</h2>
        <p className="text-[var(--color-luxury-muted)] uppercase tracking-[0.3em] text-xs font-medium">Global Exploration Log</p>
      </div>
      
      <div className="relative w-full max-w-6xl aspect-[4/3] md:aspect-[21/9] flex items-center justify-center rounded-[2rem] border border-[var(--color-luxury-border)] bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden shadow-2xl">
        <WorldMap visitedPlaces={allVisitedPlaces} />
        
        {/* Vignette overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-luxury-bg)_120%)] pointer-events-none" />

        <div className="absolute bottom-6 md:bottom-10 right-6 md:right-10 flex flex-col items-end pointer-events-none z-10">
          <div className="bg-[var(--color-luxury-bg)]/60 backdrop-blur-xl px-8 py-6 rounded-2xl border border-[var(--color-luxury-border)] shadow-2xl text-right">
            <p className="text-5xl md:text-6xl font-serif text-[#D4AF37] mb-2 leading-none">{explorationPercentage}%</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold">of the world explored</p>
          </div>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full max-w-5xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="flex flex-col items-center justify-center p-10 glass-panel rounded-[2rem] hover:bg-white/[0.04] transition-colors shadow-lg"
        >
          <p className="text-5xl font-serif mb-4 text-[var(--color-luxury-ink)]">{stats.visitedPlacesList.length}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold">Places Visited</p>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex flex-col items-center justify-center p-10 glass-panel rounded-[2rem] hover:bg-white/[0.04] transition-colors shadow-lg"
        >
          <p className="text-5xl font-serif mb-4 text-[var(--color-luxury-ink)]">{stats.visitedCities}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold">Cities Explored</p>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-col items-center justify-center p-10 glass-panel rounded-[2rem] hover:bg-white/[0.04] transition-colors shadow-lg"
        >
          <p className="text-5xl font-serif mb-4 text-[var(--color-luxury-ink)]">{stats.milesTraveled.toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-luxury-muted)] font-semibold">Miles Traveled</p>
        </motion.div>
      </div>

      {savedItineraries.length > 0 && (
        <div className="mt-24 w-full max-w-5xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-serif mb-4 text-[var(--color-luxury-ink)] tracking-tight">Saved Journeys</h3>
            <p className="text-[var(--color-luxury-muted)] uppercase tracking-[0.2em] text-[10px] font-medium">Your Past Itineraries</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {savedItineraries.map((trip, index) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, duration: 0.6 }}
                key={trip.id} 
                className="flex flex-col p-8 glass-panel rounded-[2rem] hover:bg-white/[0.04] transition-colors shadow-lg group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-accent)]/5 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div>
                    <h4 className="text-2xl font-serif text-[var(--color-luxury-ink)] mb-2">{trip.destination}</h4>
                    <p className="text-xs text-[var(--color-luxury-muted)] font-mono">{new Date(trip.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button 
                    onClick={() => handleDeleteTrip(trip.id)}
                    className="p-2 text-[var(--color-luxury-muted)] hover:text-red-400 transition-colors rounded-full hover:bg-red-400/10"
                    title="Delete Itinerary"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-auto pt-6 border-t border-[var(--color-luxury-border)] relative z-10">
                  <button 
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(trip.itineraryData);
                        onViewItinerary(parsed);
                      } catch (e) {
                        console.error("Failed to parse itinerary data", e);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)] rounded-full text-xs uppercase tracking-[0.1em] font-semibold hover:bg-[var(--color-accent)] hover:text-[#0f0f0f] transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View Itinerary
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
