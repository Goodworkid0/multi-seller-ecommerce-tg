import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Gift, Calendar, CheckCircle, Wallet, Users, Trophy, ChevronDown, Clock } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'

const fmt = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return ''
  }
}

export default function Giveaways() {
  const { user } = useAuthStore()
  const { addToast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [enteringId, setEnteringId] = useState(null)
  const [entered, setEntered] = useState({}) // giveawayId -> true

  // Past giveaways
  const [pastItems, setPastItems] = useState([])
  const [pastTotal, setPastTotal] = useState(0)
  const [pastLoading, setPastLoading] = useState(false)
  const [pastOffset, setPastOffset] = useState(0)
  const [showPast, setShowPast] = useState(false)
  const PAST_LIMIT = 10

  const load = async () => {
    setLoading(true)
    try {
      // Users are always registered; use auth endpoint to get already_entered.
      const { data } = await api.get('/api/giveaways/for-user')
      const list = data || []
      setItems(list)
      const enteredMap = {}
      for (const g of list) {
        if (g?.already_entered) enteredMap[g.id] = true
      }
      setEntered(enteredMap)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const loadPast = async (offset = 0) => {
    setPastLoading(true)
    try {
      const { data } = await api.get(`/api/giveaways/past?limit=${PAST_LIMIT}&offset=${offset}`)
      if (offset === 0) {
        setPastItems(data.items || [])
      } else {
        setPastItems(prev => [...prev, ...(data.items || [])])
      }
      setPastTotal(data.total || 0)
      setPastOffset(offset + PAST_LIMIT)
    } catch {
      // ignore
    } finally {
      setPastLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (showPast && pastItems.length === 0) loadPast(0)
  }, [showPast])

  const enter = async (g) => {
    if (enteringId) return
    setEnteringId(g.id)
    try {
      if (!user) {
        addToast('Login required', { type: 'error' })
        return
      }
      const { data } = await api.post(`/api/giveaways/${g.id}/enter`, {})
      if (data?.ok) {
        setEntered(prev => ({ ...prev, [g.id]: true }))
        addToast('You entered the giveaway!', { type: 'success', title: 'Entered!' })
      }
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to enter', { type: 'error' })
    } finally {
      setEnteringId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Giveaways</h1>
          <p className="text-dark-400 text-xs">Current giveaways</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-1/2 bg-dark-800 rounded mb-2" />
              <div className="h-3 w-2/3 bg-dark-800 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <Gift size={32} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-400 text-sm mb-1">No giveaways right now</p>
          <p className="text-dark-500 text-xs">Check back later.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((g, i) => {
            const isEntered = !!entered[g.id]
            const isEntering = enteringId === g.id
            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
                    <Gift size={18} className="text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold truncate">{g.title}</h3>
                      <div className="flex items-center gap-1">
                        {g.winner_mode === 'most_referrals' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">🏆 Tournament</span>
                        )}
                        {g.min_referrals > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400">{g.min_referrals}+ refs</span>
                        )}
                        {g.winner_count > 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{g.winner_count} places</span>
                        )}
                        {g.require_name_keyword && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">📛 "{g.require_name_keyword}" in name</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            g.deposit_required ? 'bg-amber-500/15 text-amber-400' : 'bg-dark-800 text-dark-300'
                        }`}>
                            {g.deposit_required ? (
                              <span className="inline-flex items-center gap-1"><Wallet size={10} /> Deposit required</span>
                            ) : (
                              <span>All users</span>
                            )}
                        </span>
                      </div>
                    </div>

                    {/* Multiple winners display */}
                    {g.winners?.length > 0 ? (
                      <div className="text-[11px] text-emerald-400 mt-1 space-y-0.5">
                        {g.winners.map((w, i) => (
                          <p key={i}>
                            <span className="font-semibold">
                              {i + 1}. {w.display_name}
                            </span>
                            {w.picked_at && <span className="text-dark-500"> • {fmt(w.picked_at)}</span>}
                          </p>
                        ))}
                      </div>
                    ) : g.winner?.display_name ? (
                      <p className="text-[11px] text-emerald-400 mt-1">
                        Winner: <span className="font-semibold">{g.winner.display_name}</span>
                        {g.winner.picked_at ? (
                          <span className="text-dark-500"> • {fmt(g.winner.picked_at)}</span>
                        ) : null}
                      </p>
                    ) : null}
                    {g.prize && (
                      <p className="text-xs text-primary-300 mt-1">Prize: {g.prize}</p>
                    )}
                    {g.description && (
                      <p className="text-xs text-dark-300 mt-1 leading-relaxed whitespace-pre-wrap">{g.description}</p>
                    )}
                    {(g.starts_at || g.ends_at) && (
                      <p className="text-[11px] text-dark-500 mt-2 inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {g.starts_at ? `Starts: ${fmt(g.starts_at)}` : ''}
                        {g.ends_at ? `${g.starts_at ? ' • ' : ''}Ends: ${fmt(g.ends_at)}` : ''}
                      </p>
                    )}

                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-dark-800/50">
                  <div className="flex items-center justify-between text-[11px] text-dark-400 mb-2">
                    <span className="inline-flex items-center gap-1"><Users size={12} /> Participants</span>
                    <span className="text-dark-500">{g.participant_count || 0}</span>
                  </div>
                  {(g.participants || []).length === 0 ? (
                    <p className="text-xs text-dark-500">No participants yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(g.participants || []).slice(0, 30).map((p, idx) => (
                        <span key={idx} className="px-2 py-1 rounded-full bg-dark-800 text-[11px] text-dark-200">
                          {p.display_name}
                        </span>
                      ))}
                      {(g.participants || []).length > 30 && (
                        <span className="px-2 py-1 rounded-full bg-dark-800 text-[11px] text-dark-500">+{(g.participants || []).length - 30}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <button
                    onClick={() => enter(g)}
                    disabled={isEntering || isEntered}
                    className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isEntered ? (
                      <>
                        <CheckCircle size={14} /> Entered
                      </>
                    ) : (
                      <>
                        <Gift size={14} /> {isEntering ? 'Entering...' : 'Enter Giveaway'}
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Past Giveaways */}
      <div className="mt-6">
        <button
          onClick={() => setShowPast(p => !p)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Trophy size={16} className="text-amber-400" />
          <span className="font-display text-sm font-semibold">Previous Giveaways</span>
          <ChevronDown size={14} className={`text-dark-400 transition-transform ${showPast ? 'rotate-180' : ''}`} />
        </button>

        {showPast && (
          <div className="mt-3 space-y-2">
            {pastLoading && pastItems.length === 0 ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card p-3 animate-pulse">
                    <div className="h-3 w-1/2 bg-dark-800 rounded mb-1.5" />
                    <div className="h-2.5 w-1/3 bg-dark-800 rounded" />
                  </div>
                ))}
              </div>
            ) : pastItems.length === 0 ? (
              <div className="card p-6 text-center">
                <Clock size={24} className="mx-auto text-dark-600 mb-2" />
                <p className="text-dark-500 text-xs">No past giveaways yet</p>
              </div>
            ) : (
              <>
                {pastItems.map((g, i) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="card p-3 opacity-90"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center shrink-0">
                        <Trophy size={14} className="text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-semibold truncate">{g.title}</h4>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-dark-800 text-dark-400">
                            {g.participant_count || 0} participants
                          </span>
                        </div>
                        {g.prize && (
                          <p className="text-[11px] text-primary-300 mt-0.5">Prize: {g.prize}</p>
                        )}
                        {/* Winners */}
                        {g.winners?.length > 0 ? (
                          <div className="mt-1.5 space-y-0.5">
                            {g.winners.map((w, wi) => (
                              <div key={wi} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-amber-400">#{w.place || wi + 1}</span>
                                <span className="text-[11px] text-emerald-400 font-medium">{w.display_name}</span>
                                {w.picked_at && <span className="text-[10px] text-dark-600">• {fmt(w.picked_at)}</span>}
                              </div>
                            ))}
                          </div>
                        ) : g.winner?.display_name ? (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Trophy size={10} className="text-amber-400" />
                            <span className="text-[11px] text-emerald-400 font-medium">{g.winner.display_name}</span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-dark-500 mt-1">No winner selected</p>
                        )}
                        {g.ends_at && (
                          <p className="text-[10px] text-dark-600 mt-1 inline-flex items-center gap-1">
                            <Calendar size={9} /> Ended: {fmt(g.ends_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {pastItems.length < pastTotal && (
                  <button
                    onClick={() => loadPast(pastOffset)}
                    disabled={pastLoading}
                    className="w-full py-2 text-xs text-dark-400 hover:text-dark-200 transition-colors disabled:opacity-50"
                  >
                    {pastLoading ? 'Loading...' : `Load more (${pastTotal - pastItems.length} remaining)`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
