/* TimeWise — Supabase integration layer.
   Loaded only when config.js contains real credentials. Everything degrades
   gracefully to the local demo store when Supabase is not configured. */

window.TimeWiseBackend = (function () {
  'use strict';

  var client = null;
  var clientPromise = null;
  var authCallbacks = [];
  var realtimeChannel = null;
  var realtimeUserId = null;

  function config() {
    return window.TimeWiseConfig || {};
  }

  function isConfigured() {
    var cfg = config();
    var url = String(cfg.supabaseUrl || '');
    var key = String(cfg.supabaseAnonKey || '');
    return /^https:\/\//.test(url) && key.length > 20 && key.indexOf('YOUR_') !== 0;
  }

  function emitStatus(state, label, error) {
    window.dispatchEvent(new CustomEvent('timewise:backend-status', {
      detail: { state: state, label: label, error: error || null }
    }));
  }

  function emitError(message) {
    window.dispatchEvent(new CustomEvent('timewise:error', { detail: String(message) }));
  }

  function redirectTo(file) {
    var base = String(config().redirectUrl || '').trim();
    if (!base) return new URL(file, window.location.href).href;
    return new URL(file, base.replace(/\/+$/, '') + '/').href;
  }

  function setupAuthListener() {
    if (!client || authCallbacks.length === 0) return;
    client.auth.onAuthStateChange(function (event, session) {
      emitStatus(session ? 'online' : 'local', session ? 'Connected' : 'Local demo');
      window.dispatchEvent(new CustomEvent('timewise:auth-change', {
        detail: { event: event, session: session }
      }));
      authCallbacks.forEach(function (callback) {
        try { callback(session); } catch (e) { /* keep other callbacks alive */ }
      });
    });
  }

  function getClient() {
    if (!isConfigured()) {
      emitStatus('local', 'Local demo');
      return Promise.resolve(null);
    }
    if (client) return Promise.resolve(client);
    if (!clientPromise) {
      emitStatus('connecting', 'Connecting…');
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
        .then(function (module) {
          client = module.createClient(config().supabaseUrl, config().supabaseAnonKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
          });
          emitStatus('connecting', 'Checking session…');
          setupAuthListener();
          return client;
        })
        .catch(function (error) {
          emitStatus('error', 'Supabase unavailable', error);
          emitError('Could not load Supabase: ' + error.message);
          return null;
        });
    }
    return clientPromise;
  }

  function getSession() {
    return getClient().then(function (supabase) {
      if (!supabase) return null;
      return supabase.auth.getSession().then(function (result) { return result.data.session; });
    });
  }

  function signUp(data) {
    return getClient().then(function (supabase) {
      if (!supabase) throw new Error('Add your Supabase details in assets/js/config.js first.');
      return supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.name },
          emailRedirectTo: redirectTo('dashboard.html')
        }
      });
    });
  }

  function signIn(email, password) {
    return getClient().then(function (supabase) {
      if (!supabase) throw new Error('Add your Supabase details in assets/js/config.js first.');
      return supabase.auth.signInWithPassword({ email: email, password: password });
    });
  }

  function signInWithOAuth(provider) {
    return getClient().then(function (supabase) {
      if (!supabase) throw new Error('Add your Supabase details in assets/js/config.js first.');
      return supabase.auth.signInWithOAuth({
        provider: provider.toLowerCase(),
        options: { redirectTo: redirectTo('dashboard.html') }
      });
    });
  }

  function sendPasswordReset(email) {
    return getClient().then(function (supabase) {
      if (!supabase) throw new Error('Add your Supabase details in assets/js/config.js first.');
      return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo('reset.html')
      });
    });
  }

  function updatePassword(password) {
    return getClient().then(function (supabase) {
      if (!supabase) throw new Error('Add your Supabase details in assets/js/config.js first.');
      if (!password || String(password).length < 8) throw new Error('Use at least 8 characters.');
      return supabase.auth.updateUser({ password: password });
    });
  }

  function joinWaitlist(email) {
    return getClient().then(function (supabase) {
      if (!supabase) return null;
      return supabase.from('waitlist').insert({ email: String(email).trim().toLowerCase() });
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return true;
    });
  }

  function signOut() {
    return getClient().then(function (supabase) {
      if (!supabase) return null;
      return supabase.auth.signOut();
    });
  }

  function onAuthChange(callback) {
    authCallbacks.push(callback);
    if (client) setupAuthListener();
  }

  function currentUser() {
    return getSession().then(function (session) { return session ? session.user : null; });
  }

  function profileFromRow(row) {
    if (!row) return null;
    return {
      name: row.display_name || 'Friend',
      focusMinutes: Number(row.focus_minutes) === 50 ? 50 : 25,
      weekStart: row.week_start === 'sunday' ? 'sunday' : 'monday',
      theme: row.theme === 'dark' ? 'dark' : 'light'
    };
  }

  function getProfile() {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      return client.from('profiles')
        .select('display_name, focus_minutes, week_start, theme')
        .eq('id', user.id)
        .maybeSingle();
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return profileFromRow(result.data);
    });
  }

  function saveProfile(patch) {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      var row = { id: user.id, updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.display_name = String(patch.name).slice(0, 60) || 'Friend';
      if (patch.focusMinutes !== undefined) row.focus_minutes = Number(patch.focusMinutes) === 50 ? 50 : 25;
      if (patch.weekStart !== undefined) row.week_start = patch.weekStart === 'sunday' ? 'sunday' : 'monday';
      if (patch.theme !== undefined) row.theme = patch.theme === 'dark' ? 'dark' : 'light';
      return client.from('profiles').upsert(row, { onConflict: 'id' }).select().single();
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return profileFromRow(result.data);
    });
  }

  function normalizeSubtasks(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (item) {
      return {
        id: item.id || 's' + Date.now() + Math.random().toString(36).slice(2, 6),
        title: String(item.title || 'Untitled step'),
        done: Boolean(item.done)
      };
    });
  }

  function reminderMinutes(value) {
    var minutes = Number(value);
    return [0, 5, 10, 15, 30, 60].indexOf(minutes) !== -1 ? minutes : 10;
  }

  function mapSessionFromRow(row) {
    return {
      id: row.id,
      taskId: row.task_id || null,
      taskTitle: row.task_title || '',
      durationMinutes: Number(row.duration_minutes) || 25,
      startedAt: row.started_at || new Date().toISOString()
    };
  }

  function mapFromRow(row) {
    return {
      id: row.id,
      title: row.title,
      time: row.time || 'Anytime',
      tag: row.tag || 'Personal',
      priority: row.priority || 'medium',
      due: row.due || '',
      notes: row.notes || '',
      repeat: ['daily', 'weekly', 'monthly'].indexOf(String(row.repeat || 'none')) !== -1 ? String(row.repeat) : 'none',
      subtasks: normalizeSubtasks(row.subtasks),
      planOrder: row.plan_order === null || row.plan_order === undefined ? null : Number(row.plan_order),
      reminderMinutes: reminderMinutes(row.reminder_minutes),
      snoozedUntil: row.snoozed_until || null,
      done: Boolean(row.done),
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  function mapToRow(task, userId) {
    return {
      id: task.id,
      user_id: userId,
      title: task.title,
      time: task.time || 'Anytime',
      tag: task.tag || 'Personal',
      priority: task.priority || 'medium',
      due: task.due || null,
      notes: task.notes || '',
      repeat: ['daily', 'weekly', 'monthly'].indexOf(String(task.repeat || 'none')) !== -1 ? String(task.repeat) : 'none',
      subtasks: normalizeSubtasks(task.subtasks),
      plan_order: Number.isFinite(Number(task.planOrder)) ? Number(task.planOrder) : null,
      reminder_minutes: reminderMinutes(task.reminderMinutes),
      snoozed_until: task.snoozedUntil || null,
      done: Boolean(task.done),
      created_at: task.createdAt || new Date().toISOString()
    };
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function requireUser() {
    return currentUser();
  }

  function fetchTasks() {
    return requireUser().then(function (user) {
      if (!user) return null;
      return client.from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('plan_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return result.data.map(mapFromRow);
    });
  }

  function insertTask(task) {
    return requireUser().then(function (user) {
      if (!user) return null;
      var row = mapToRow(task, user.id);
      if (!isUuid(row.id)) delete row.id;
      return client.from('tasks').insert(row).select().single();
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return mapFromRow(result.data);
    });
  }

  function updateTask(id, patch) {
    return requireUser().then(function (user) {
      if (!user || !isUuid(id)) return null;
      var source = Object.assign({ title: '', time: 'Anytime', tag: 'Personal', priority: 'medium', due: null, notes: '', repeat: 'none', subtasks: [], planOrder: null, reminderMinutes: 10, snoozedUntil: null, done: false }, patch);
      var row = {
        title: source.title,
        time: source.time,
        tag: source.tag,
        priority: source.priority,
        due: source.due || null,
        notes: source.notes || '',
        repeat: ['daily', 'weekly', 'monthly'].indexOf(String(source.repeat || 'none')) !== -1 ? String(source.repeat) : 'none',
        subtasks: normalizeSubtasks(source.subtasks),
        plan_order: Number.isFinite(Number(source.planOrder)) ? Number(source.planOrder) : null,
        reminder_minutes: reminderMinutes(source.reminderMinutes),
        snoozed_until: source.snoozedUntil || null,
        done: Boolean(source.done)
      };
      return client.from('tasks').update(row).eq('id', id).eq('user_id', user.id).select().single();
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return mapFromRow(result.data);
    });
  }

  function deleteTask(id) {
    return requireUser().then(function (user) {
      if (!user || !isUuid(id)) return null;
      return client.from('tasks').delete().eq('id', id).eq('user_id', user.id);
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return true;
    });
  }

  function clearCompleted() {
    return requireUser().then(function (user) {
      if (!user) return null;
      return client.from('tasks').delete().eq('user_id', user.id).eq('done', true);
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return true;
    });
  }

  function fetchSessions() {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      return client.from('focus_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return result.data.map(mapSessionFromRow);
    });
  }

  function insertSession(session) {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      var row = {
        user_id: user.id,
        task_title: session.taskTitle || '',
        duration_minutes: Number(session.durationMinutes) || 25,
        started_at: session.startedAt || new Date().toISOString()
      };
      if (isUuid(session.taskId)) row.task_id = session.taskId;
      return client.from('focus_sessions').insert(row).select().single();
    }).then(function (result) {
      if (!result) return null;
      if (result.error) throw result.error;
      return mapSessionFromRow(result.data);
    });
  }

  function savePushSubscription(subscription, timezone) {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      var keys = subscription && subscription.toJSON ? subscription.toJSON().keys : (subscription && subscription.keys);
      if (!subscription || !subscription.endpoint || !keys) throw new Error('Invalid push subscription.');
      var row = {
        user_id: user.id,
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        timezone: timezone || 'UTC'
      };
      return client.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }).select().single();
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return result ? result.data : null;
    });
  }

  function removePushSubscription(endpoint) {
    return requireUser().then(function (user) {
      if (!user || !client || !endpoint) return null;
      return client.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return true;
    });
  }

  function subscribeTasks(callback) {
    return requireUser().then(function (user) {
      if (!user || !client) return null;
      if (realtimeChannel && realtimeUserId === user.id) return realtimeChannel;
      if (realtimeChannel) client.removeChannel(realtimeChannel);
      realtimeUserId = user.id;
      realtimeChannel = client
        .channel('timewise-tasks-' + user.id)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'user_id=eq.' + user.id
        }, callback)
        .subscribe();
      return realtimeChannel;
    }).catch(function (error) {
      emitError('Realtime subscription failed: ' + error.message);
      return null;
    });
  }

  return {
    isConfigured: isConfigured,
    getClient: getClient,
    getSession: getSession,
    currentUser: currentUser,
    signUp: signUp,
    signIn: signIn,
    signInWithOAuth: signInWithOAuth,
    sendPasswordReset: sendPasswordReset,
    updatePassword: updatePassword,
    joinWaitlist: joinWaitlist,
    signOut: signOut,
    onAuthChange: onAuthChange,
    getProfile: getProfile,
    saveProfile: saveProfile,
    fetchTasks: fetchTasks,
    insertTask: insertTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    clearCompleted: clearCompleted,
    fetchSessions: fetchSessions,
    insertSession: insertSession,
    subscribeTasks: subscribeTasks,
    savePushSubscription: savePushSubscription,
    removePushSubscription: removePushSubscription
  };
})();
