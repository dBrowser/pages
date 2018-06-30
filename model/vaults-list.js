const emitStream = require('emit-stream')
const dWebNetSpeed = require('@dwcore/netspeed')
const EventTarget = require('./event-target')
const { throttle, debounce } = require('../functions')

// constants
// =

// how much time to wait between throttle emits
const EMIT_CHANGED_WAIT = 500

// exported api
// =

module.exports = class VaultsList extends EventTarget {
  constructor ({listenNetwork} = {}) {
    super()

    // declare attributes
    this.vaults = []

    // wire up events
    dbrowser.vaults.addEventListener('added', this.onAdd.bind(this))
    dbrowser.vaults.addEventListener('removed', this.onRemove.bind(this))
    dbrowser.vaults.addEventListener('updated', this.onUpdate.bind(this))
    if (listenNetwork) {
      dbrowser.vaults.addEventListener('network-changed', this.onNetworkChange.bind(this))
    }

    // create a throttled 'change' emiter
    this.emitChanged = throttle(() => this.dispatchEvent({type: 'changed'}), EMIT_CHANGED_WAIT)
  }

  async setup (filter) {
    // fetch vaults
    this.vaults = await dbrowser.vaults.list(filter)
    this.vaults.sort(vaultSortFn)
  }

  // event handlers
  // =

  onAdd (e) {
    var vault = this.vaults.find(a => a.url === e.details.url)
    if (vault) return
    dbrowser.vaults.get(e.details.url).then(vault => {
      this.vaults.push(vault)
      this.emitChanged()
    })
  }

  onRemove (e) {
    var index = this.vaults.findIndex(a => a.url === e.details.url)
    if (index === -1) return
    this.vaults.splice(index, 1)
    this.emitChanged()
  }

  onUpdate (e) {
    // find the vault being updated
    var vault = this.vaults.find(a => a.url === e.details.url)
    if (vault) {
      // patch the vault
      for (var k in e.details) {
        vault[k] = e.details[k]
      }
      this.emitChanged()
    }
  }

  onNetworkChange (e) {
    // find the vault being updated
    var vault = this.vaults.find(a => a.url === e.details.url)
    if (vault) {
      // patch the vault
      vault.peers = e.details.peerCount
      if (vault.peerHistory) {
        var now = Date.now()
        var lastHistory = vault.peerHistory.slice(-1)[0]
        if (lastHistory && (now - lastHistory.ts) < 10e3) {
          // if the last datapoint was < 10s ago, just update it
          lastHistory.peers = vault.peers
        } else {
          vault.peerHistory.push({
            ts: Date.now(),
            peers: vault.peers
          })
        }
      }
      this.emitChanged()
    }
  }
}

// helpers
// =

function vaultSortFn (a, b) {
  return (a.title||'Untitled').localeCompare(b.title||'Untitled')
}
