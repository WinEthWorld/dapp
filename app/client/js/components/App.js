const ENS = require('ethereum-ens')

import createHistory from "history/createBrowserHistory"

const history = window.History = createHistory()
const config = require('../config')
const clientApi = require('../utils/ClientApi')

const registryAbi = require(`../abi/TweedentityRegistry`)
const storeAbi = require(`../abi/Datastore`)
const managerAbi = require(`../abi/StoreManager`)
const claimerAbi = require(`../abi/OwnershipClaimer`)

const {Modal, Button} = ReactBootstrap

const Db = require('../utils/Db')

window.DEV = /localhost/.test(location.host)

import Header from './Header'
import Footer from './Footer'
import Unconnected from "./Unconnected"
import Welcome from "./Welcome"
import WalletStats from "./WalletStats"
import GetUsername from './GetUsername'
import UserIdFound from './UserIdFound'
import Signed from './Signed'
import Set from './Set'
import SectionNotFound from './SectionNotFound'
import ManageAccount from './ManageAccount'
import Unset from './Unset'
import LandingPage from './LandingPage'
import Terms from './Terms'
import Profile from './Profile'

class App extends React.Component {

  constructor(props) {
    super(props)

    const www = /^(www\.|)(tweedentity|qabra)\.com(\.localhost|)$/.test(location.host)

    this.db = new Db(data => {
      this.setState({
        data
      })
    })

    let hash0
    if (/profile/.test(location.hash)) {
      hash0 = location.hash.substring(2)
    }

    this.state = {
      connected: -1,
      connectionChecked: false,
      netId: null,
      err: null,
      loading: false,
      data: this.db.data,
      sections: {},
      www,
      config,
      ready: -1,
      hash0,
      profiles: {}
    }

    for (let m of [
      'getNetwork',
      'watchAccounts0',
      'getAccounts',
      'setAppState',
      'getEthInfo',
      'getContracts',
      'callMethod',
      'handleClose',
      'handleShow',
      'isProfile',
      'getStores',
      'checkPendingTxs'
    ]) {
      this[m] = this[m].bind(this)
    }

    if (!www) {
      setTimeout(this.getNetwork, 100)
    }

  }

  componentDidMount() {
    history.listen(location => {
      this.isProfile(location.hash)
      this.setState({
        hash: location.hash
      })
    })
    if (!this.state.www) {
      document.title = 'Tweedentity ÐApp (BETA)'
    }
    this.historyPush({
      section: this.state.www ? 'home' : 'connecting'
    })
  }

  getNetwork() {

    if (typeof web3 !== 'undefined') {
      console.log('Using web3 detected from external source like MetaMask')

      this.web3js = new Web3(web3.currentProvider)
      this.web3js.eth.getTransactionReceiptMined = require("../utils/getTransactionReceiptMined")


      this.web3js.version.getNetwork((err, netId) => {

        let env

        switch (netId) {
          case '1':
            if (config.registry.address.main) {
              env = 'main'
            }
            break
          case '3':
            if (config.registry.address.ropsten) {
              env = 'ropsten'
              break
            }
          default:
            this.setState({
              netId: '0',
              connected: 0,
              connectionChecked: true
            })
        }

        if (env) {

          this.setState({
            netId,
            connected: 1,
            env
          })

          if (env === 'main') {
            (new ENS(this.web3js))
              .resolver('tweedentity.eth')
              .addr()
              .then(addr => {
                this.getStores(addr)
              })
          } else {
            this.getStores(config.registry.address[env])
          }

        }
      })

    } else {
      console.log('web3 not detected')

      this.setState({
        connected: 0,
        connectionChecked: true
      })
    }
  }

  getStores(registryAddress) {
    const registry = this.web3js.eth.contract(registryAbi).at(registryAddress)
    registry.getStore('twitter', (err, twitterStore) => {

      registry.getStore('reddit', (err, redditStore) => {

        this.contracts = {
          registry,
          twitterStore: this.web3js.eth.contract(storeAbi).at(twitterStore),
          redditStore: this.web3js.eth.contract(storeAbi).at(redditStore)
        }

        this.getEthInfo()
        this.watchAccounts0(true)
        setInterval(this.watchAccounts0, 1000)
        this.getContracts()
      })
    })
  }

  getContracts() {

    const registry = this.contracts.registry

    registry.isReady((err, ready) => {
      if (ready.valueOf() === '0') {
        this.setState({
          ready: 1
        })
        registry.manager((err, result) => {
          this.contracts.manager = this.web3js.eth.contract(managerAbi).at(result)
          registry.claimer((err, result) => {
            this.contracts.claimer = this.web3js.eth.contract(claimerAbi).at(result)
          })
        })
      } else {
        this.setState({
          ready: 0
        })
      }
    })
  }

  getEthInfo() {
    return clientApi
      .fetch('eth-info', 'POST', {
          network: this.state.netId
        }
      )
      .then((responseJson) => {
        this.setState(responseJson)
      })
      .catch(err => {
        if (!this.state.price) {
          this.setState({
            noEthInfo: true
          })
        }
      })
  }

  watchAccounts0(setConnection) {
    const wallet = this.web3js.eth.accounts[0]
    if (this.state.wallet !== wallet) {
      this.setState({
        wallet
      })
      let shortWallet = wallet.substring(0, 6)
      if (!this.state.data[shortWallet]) {
        this.db.put(shortWallet, {})
      }
      this.getAccounts()
      if (this.state.hash === '#/connecting') {
        this.historyPush({
          section: this.state.hash0 || 'welcome',
          replace: true
        })
        if (this.state.hash0) {
          this.setState({
            hash0: null
          })
        }
      }
    }
    if (setConnection) {
      this.setState({
        connectionChecked: true
      })
    }
  }

  isValidAddress(address) {
    return /^0x[0-9a-fA-F]{40}$/.test(address)
  }

  isProfile(hash) {
    if (/profile/.test(hash)) {
      let address = hash.split('/')[2]
      if (this.isValidAddress(address)) {
        this.setState({
          profileAddress: address
        })
        this.getAccounts({address})
      } else {
        this.setState({
          profileAddress: address,
          invalidProfileAddress: true
        })
      }
    }
  }

  getAccounts(params = {}) {

    let isProfile = false

    let address = params.address
    if (address) {
      isProfile = true
      const profiles = {}
      profiles[address] = {
        twitter: {},
        reddit: {},
        loaded: false
      }
      this.setState({
        profiles
      })
    } else {
      address = this.state.wallet
    }

    if (address) {

      let shortWallet = address.substring(0, 6)

      let count = 0

      for (let appNickname of ['twitter', 'reddit']) {
        const store = appNickname + 'Store'

        this.contracts[store].getUid(address, (err, result) => {

          let data = {}
          data[appNickname] = {}

          if (result !== '') {

            let userId = typeof result === 'string' ? result : result.valueOf()

            if (userId !== '') {
              return clientApi
                .fetch(`data/${appNickname}`, 'POST', {
                  network: this.state.netId,
                  userId
                })
                .then(json => {
                  count++
                  const {name, username, avatar, userId} = json.result
                  const profile = {
                    userId,
                    name,
                    username,
                    avatar
                  }
                  if (isProfile) {
                    const profiles = this.state.profiles
                    profiles[address][appNickname] = profile
                    if (count === 2) {
                      profiles[address].loaded = true
                      this.checkPendingTxs(profiles)
                    }
                  } else {
                    data[appNickname] = profile
                    this.db.put(shortWallet, data)
                  }
                })
                .catch(function (ex) {
                  console.log('parsing failed', ex)
                })
            }
          } else if (isProfile) {
            count++
            const profiles = this.state.profiles
            if (count === 2) {
              profiles[address].loaded = true
              this.checkPendingTxs(profiles)
            }
          } else {
            this.db.put(shortWallet, data)
          }

        })
      }
    }
  }

  checkPendingTxs(profiles) {
    // const claimer = this.contracts.claimer.address
    // return clientApi
    //   .fetch('wallet-stats', 'POST', {
    //     network: this.state.netId,
    //     address: this.state.wallet,
    //     claimer: this.props.contracts.claimer.address
    //   })
    //   .then((responseJson) => {
    //
    //     console.log(responseJson)
        this.setState({
          profiles
        })

      // })

  }

  setAppState(states) {
    this.setState(states)
  }

  historyBack() {
    history.goBack()
  }

  historyPush(args) {
    const shortWallet = (this.state.wallet || '0x0000').substring(0, 6)
    const sections = this.state.sections
    if (!sections[shortWallet]) {
      sections[shortWallet] = {}
    }
    sections[shortWallet][args.section] = true
    this.setState({sections})
    history[
      args.replace ? 'replace' : 'push'
      ](`#/${args.section}`)
  }

  callMethod(method, args) {
    if ([
      'historyPush',
      'historyBack',
      'setAppState',
      'getEthInfo',
      'getAccounts'
    ].indexOf(method) !== -1) {
      this[method](args || {})
    } else {
      console.error(`Method ${method} not allowed.`)
    }
  }

  handleClose() {
    this.setState({show: false});
  }

  handleShow() {
    this.setState({show: true});
  }

  render() {

    const app = {
      appState: this.state,
      callMethod: this.callMethod,
      db: this.db,
      web3js: this.web3js,
      contracts: this.contracts,
      history
    }

    let section = this.state.hash ? this.state.hash.split('/')[1] : null

    let header
    let component

    if (this.state.www) {

      component = <LandingPage app={app}/>


    } else {

      header = <Header app={app}/>
      component = <SectionNotFound app={app}/>

      if (!section || section === 'connecting') {
        component = <Unconnected app={app}/>
      } else if (this.state.wallet) {
        const sections = this.state.sections[this.state.wallet.substring(0, 6)] || {}
        if (section === 'welcome' || section === 'profile' || sections[section]) {
          if (section === 'welcome') {
            component = <Welcome app={app}/>
          } else if (section === 'wallet-stats') {
            component = <WalletStats app={app}/>
          } else if (section === 'get-username') {
            component = <GetUsername app={app}/>
          } else if (section === 'userid-found') {
            component = <UserIdFound app={app}/>
          } else if (section === 'signed') {
            component = <Signed app={app}/>
          } else if (section === 'set') {
            component = <Set app={app}/>
          } else if (section === 'manage-account') {
            component = <ManageAccount app={app}/>
          } else if (section === 'unset') {
            component = <Unset app={app}/>
          } else if (section === 'terms') {
            component = <Terms app={app}/>
          } else if (section === 'profile') {
            component = <Profile app={app}/>
          }
        }
      }
    }

    return (
      <div>
        {header}
        {component}
        <Footer app={app}/>
        {this.state.show
          ? <Modal.Dialog>
            <Modal.Header>
              <Modal.Title>{this.state.modalTitle}</Modal.Title>
            </Modal.Header>

            <Modal.Body>{this.state.modalBody}</Modal.Body>

            <Modal.Footer>
              <Button onClick={() => {
                this.setState({show: false})
              }}>{this.state.modalClose || 'Close'}</Button>
              {
                this.state.secondButton
                  ? <Button onClick={() => {
                    this.state.modalAction()
                    this.setState({show: false})
                  }} bsStyle="primary">{this.state.secondButton}</Button>
                  : null
              }
            </Modal.Footer>
          </Modal.Dialog>
          : null}
      </div>
    )
  }
}

export default App
