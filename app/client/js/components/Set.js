const Utils = require('../utils')

import LoadingButton from './extras/LoadingButton'
import LoadingBadge from './extras/LoadingBadge'
import Basic from './Basic'
import EventWatcher from '../utils/EventWatcher'
import BigAlert from './extras/BigAlert'
import GasPrice from './GasPrice'
import NoSubmit from "./extras/NoSubmit";

const {Panel, Grid, Row, Col, Button, Alert, Badge, Form, ControlLabel, FormGroup, FormControl} = ReactBootstrap

class Set extends Basic {
  constructor(props) {
    super(props)

    this.bindAll([
      'watchOracleTransactions',
      'startTransaction',
      'goHome',
      'checkUpgradability',
      'investigateNotUpgradability',
      'setCost',
      'handlePrice',
      'handlePriceManually',
      'deleteBasicPrice'
    ])
    this.state = {
      upgradability: 0
    }
    this.checkUpgradability()
    setTimeout(this.setCost, 100)
  }

  investigateNotUpgradability() {
    const store = this.appNickname() + 'Store'
    const upgradability = this.state.upgradability
    const wallet = this.appState().wallet
    const userId = this.getGlobalState('userId')

    if (upgradability === 1) {
      this.props.app.contracts[store].getAddress(this.getGlobalState('userId'), (err, result) => {
        const address = result.valueOf()
        if (address.toLowerCase() != wallet.toLowerCase()) {
          this.setState({
            upgradabilityMessage: `the userId ${userId} is currently associated with the wallet ${address}.`
          })
        }
      })
    } else {

      this.props.app.contracts[store].getAddressLastUpdate(wallet, (err, result) => {
        const addressLastUpdate = parseInt(result.valueOf(), 10)
        this.props.app.contracts[store].getUidLastUpdate(this.getGlobalState('userId'), (err, result) => {
          const uidLastUpdate = parseInt(result.valueOf(), 10)
          this.props.app.contracts.manager.minimumTimeBeforeUpdate((err, result) => {
            const minimumTimeBeforeUpdate = parseInt(result.valueOf(), 10)
            const lastUpdate = addressLastUpdate > uidLastUpdate ? addressLastUpdate : uidLastUpdate
            const now = Math.round(Date.now() / 1000)
            const timeNeed = lastUpdate + minimumTimeBeforeUpdate - now
            this.setState({
              timeNeed,
              upgradabilityMessage: `you have set it recently and, as an anti-spam limitation, you have to wait ${timeNeed} seconds before updating it.`
            })
          })
        })
      })
    }

  }

  checkUpgradability() {
    const as = this.appState()
    const wallet = as.wallet
    this.props.app.contracts.manager.getUpgradability(this.appId(), wallet, this.getGlobalState('userId'), (err, result) => {
      const upgradability = parseInt(result.valueOf(), 10)
      this.setState({
        upgradability
      })
      if (upgradability === 0) {
        this.setCost(Utils.bestPrice(as.gasInfo) / 10)
      }

    })
  }

  goHome() {
    this.db.set(this.shortWallet(), {})
    this.props.app.callMethod('getAccounts')
    this.historyPush('welcome')
  }

  componentDidMount() {
    if (this.web3js) {
      this.watcher = new EventWatcher(this.web3js)
      const checkState = () => {
        if (this.appState().wallet) {
          if (this.appState().hash === 'set') {
            this.historyPush('signed')
          }
        } else {
          setTimeout(checkState, 100)
        }
      }
      checkState()
    }
    this.props.app.callMethod('getEthInfo')
  }

  watchOracleTransactions(network, address, startBlock, gas, callback) {
    return this
      .fetch('/get-txs', 'POST', {
        network: this.appState().netId,
        address,
        startBlock,
        gas
      })
      .then(tx => {
        callback(tx)
      })
  }

  startTransaction(appState) {


    this.setGlobalState({
      step: 0
    }, {
      loading: true,
      err: null
    })

    this.watcher.stop()

    const as = this.appState()
    const ethPrice = as.price.value
    const gasInfo = as.gasInfo

    if (ethPrice && gasInfo) {

      let contracts = this.props.app.contracts

      const gasPrice = this.state.price * 1e9
      const gasLimitTx = as.config.gasLimits.tx
      const gasLimitCallback = as.config.gasLimits.callback


      this.web3js.eth.getBlockNumber((err, blockNumber) => {

        let count = 0

        let timerId
        let watchTxs = () => {
          this.watchOracleTransactions(
            appState.netId,
            as.claimer,
            blockNumber,
            gasLimitTx,
            tx => {
              if (tx && tx.isError) {
                if (tx.isError === "1") {
                  this.setGlobalState({}, {err: 'The transaction from the oracle failed.', warn: null})
                  this.watcher.stop()
                }
              } else {
                timerId = setTimeout(watchTxs, 30000)
                if (count > 5) {
                  this.setGlobalState({}, {warn: 'The oracle sometimes takes time, even hours. We suggest you to focus on something else and come back later to see if the tweedentity has been set.'})
                }
                count++
              }
            })
        }

        let callbackEvents = [
          {
            event: contracts[this.appNickname() + 'Store'].IdentitySet,
            filter: {addr: appState.wallet},
            callback: () => {
              this.setGlobalState({step: 3}, {warn: null})
              this.watcher.stop()
              clearTimeout(timerId)
            },
            fromBlock: blockNumber
          },
          {
            event: contracts.claimer.VerificatioFailed,
            filter: {addr: appState.wallet},
            callback: () => {
              this.setGlobalState({}, {err: 'The transaction failed.', warn: null})
              this.watcher.stop()
              clearTimeout(timerId)
            },
            fromBlock: blockNumber
          },
          {
            event: contracts.manager.IdentityNotUpgradable,
            filter: {addr: appState.wallet},
            callback: () => {
              this.setGlobalState({}, {err: 'Identity not upgradable.', warn: null})
              this.watcher.stop()
              clearTimeout(timerId)
            },
            fromBlock: blockNumber
          }
        ]


        let startEvents = [
          {
            event: contracts.claimer.VerificationStarted,
            filter: {addr: appState.wallet},
            callback: () => {
              this.setGlobalState({step: 2})
              this.watcher.stop()
              this.watcher.watch(callbackEvents)
              timerId = setTimeout(watchTxs, 30000)
            },
            fromBlock: blockNumber
          },
          {
            event: contracts.claimer.NotEnoughValue,
            filter: {addr: appState.wallet},
            callback: () => {
              this.setGlobalState({}, {
                err: 'The oracle has not been called',
                errMessage: 'The value was too low to cover the costs. This should not happen. Report it at support@tweedentity.com',
                NotEnoughValue: true
              })
            },
            fromBlock: blockNumber
          }
        ]

        contracts.claimer.claimAccountOwnership(
          this.appNickname(),
          this.getGlobalState('postId'),
          gasPrice,
          gasLimitCallback,
          {
            value: parseInt(this.state.value, 10),
            gas: gasLimitTx,
            gasPrice
          }, (err, txHash) => {
            if (err) {
              this.setGlobalState({}, {
                err: 'The transaction has been denied',
                errMessage: 'If you like to set your tweedentity, click the button above to start the transaction.',
                loading: false
              })
            }
            else {
              this.setGlobalState({
                txHash,
                started: true,
                step: 1
              }, {
                loading: false
              })
              this.watcher.watch(startEvents)
              this.watcher.waitFor(
                txHash,
                (receipt) => {
                  return receipt.gasUsed > 16e4
                },
                null,
                () => {
                  this.setGlobalState({}, {
                    err: 'The transaction has been reverted',
                    errMessage: 'Usually, this happens when the network is congested. We suggest you to wait a better moment before trying again.',
                  })
                }
              )
            }
          })
      })
    } else {
      this.props.getEthInfo()
      this.setGlobalState({}, {
        err: 'No ether and gas info found.',
        errMessage: 'Reloading them. Try again in a moment.',
        loading: false
      })
    }
  }

  formatFloat(f, d) {
    f = f.toString().split('.')
    return f[0] + (f[1] ? '.' + f[1].substring(0, d) : '')
  }

  deleteBasicPrice() {
    this.setState({
      basicPrice: null
    })
  }

  setCost(price) {
    const as = this.appState()

    if (as.price) {

      const ethPrice = as.price.value

      if (price < as.gasInfo.safeLow / 10) {
        this.setGlobalState({}, {
          show: true,
          modalTitle: 'Be careful',
          modalBody: `Setting the gas to a price lower than the safeLow can end up in a transaction that will never be mined. Most importantly, it is possible that the transaction succeeds but the Oracle never broadcasts the callback, and the identity won't be set.`
        })
      }

      if (price) {
        price = parseInt(price, 10)
      } else {
        price = as.gasInfo.average / 10
      }

      const gasPrice = price * 1e9
      const gasPrice21 = 21e9
      const gasLimitCallback = as.config.gasLimits.callback

      if (this.state.basicPrice) {
        let value = this.state.basicPrice + (gasPrice * gasLimitCallback)
        let eth = (parseInt(value, 10) + gasPrice * as.config.gasLimits.tx) / 1e18
        let usd = eth * ethPrice
        let eth2 = (parseInt(value, 10) + gasPrice * as.config.gasLimits.txUsage) / 1e18
        let usd2 = eth2 * ethPrice
        this.setState({
          price,
          value,
          eth: this.formatFloat(eth, 6),
          usd: this.formatFloat(usd, 3),
          eth2: this.formatFloat(eth2, 6),
          usd2: this.formatFloat(usd2, 3)
        })

      } else {

        this.props.app.contracts.claimer.calcQueryCost(gasPrice21, gasLimitCallback, (err, result) => {

          if (result !== 0) {

            this.setState({
              basicPrice: parseInt(result.toString()) - gasPrice21 * gasLimitCallback
            })
            // caches the value for 5 minutes
            setTimeout(this.deleteBasicPrice, 300000)
            this.setCost(price)
          }
        })
      }

    }
    else {
      this.props.getEthInfo()
      this.setGlobalState({}, {
        err: 'No ether and gas info found.',
        errMessage: 'Reloading them. Try again in a moment.',
        loading: false
      })
    }
  }

  handlePrice(price) {
    this.setCost(price)
  }

  handlePriceManually(e) {
    this.setState({
      inputPrice: parseInt(e.target.value, 10)
    })
  }

  render() {

    const as = this.appState()

    const {eth, usd, eth2, usd2} = this.state

    const state = as.data[this.shortWallet()]
    const appNickname = this.appNickname()

    if (!state.started) {

      const safeLow = this.formatFloat(as.gasInfo.safeLow / 10, 1)
      const sl = parseFloat(safeLow, 10)
      const average = this.formatFloat(as.gasInfo.average / 10, 1)
      const a = parseFloat(average, 10)

      let userIdBlock =
        appNickname === 'twitter'
          ? <span><span className="code">Uid:</span> <span
            className="code success">{state.userId}</span></span>
          : <span><span className="code">Uid:</span> <span
            className="code success">{state.username}</span></span>

      let note = appNickname === 'twitter'
        ? null
        : <p>
          <span style={{fontSize: '80%'}}>NOTE: For Reddit we are going to save the username in the blockchain instead of the user-id. This is fine because in Reddit the username is immutable.</span>
        </p>

      return (
        <Grid>
          <Row>
            <Col md={12}>
              <h4 style={{padding: '0 15px 8px'}}>Set your <em>tweedentity</em></h4>
              <Panel>
                <Panel.Body>
                  <p><strong>All is ready</strong></p>
                  <p>In the next step, you will send a bit of ether to the Tweedentity Smart Contract to
                    cover the gas necessary to set your <em>tweedentity</em> in the Ethereum Blockchain.</p>
                  <p>Be
                    adviced, after than you have created it, your Twitter user-id and your wallet will be publicly
                    associated.
                  </p>
                  <p>
                    {userIdBlock}<br/>
                    <span className="code">Wallet:</span> <span
                    className="code success">{as.wallet}</span>
                  </p>
                  {note}
                </Panel.Body>
              </Panel>
            </Col>
          </Row>

          {
            this.state.upgradability === 0 || (typeof this.state.timeNeed !== 'undefined' && this.state.timeNeed < 10)
              ?
              <div style={{paddingTop: 24}}>
                <Row>
                  <Col md={12}>
                    <p><strong>Choose how much you like to spend</strong></p>
                    {
                      a > 6
                        ?
                        <p><Alert bsStyle={a > 12 ? 'danger' : 'warning'}>If you aren't in a rush and can wait a better
                          moment to set up your tweedentity, you can save
                          money because sometimes the gas price is much lower.</Alert></p>
                        : null
                    }
                  </Col>
                </Row>
                <Row>
                  <Col md={6}>
                    <p>
                      <GasPrice
                        handlePrice={this.handlePrice}
                        gasInfo={as.gasInfo}
                      />
                    </p>
                  </Col>
                  <Col md={6}>
                    <p style={{paddingTop: 28}}>Alternatively, set the gas price off the suggested range</p>
                    <p>
                      <Form inline>
                        <FormGroup controlId="formInlineName">
                          <FormControl type="text" placeholder="Price in Gwei" onChange={this.handlePriceManually}
                                       width={100}/>
                          <NoSubmit/>
                        </FormGroup>
                        {' '}
                        <Button
                          bsStyle="success"
                          type="submit"
                          onClick={e => {
                            e.preventDefault()
                            this.setCost(this.state.inputPrice)
                          }}>Set</Button>
                      </Form>
                    </p>
                  </Col>
                </Row>
                <Row>
                  <Col md={12}>
                    <p>Gas price: <strong>{this.state.price}</strong> &nbsp; Total value: <strong>{eth} ETH (
                      ~${usd} )</strong><br/>Expected final cost: <strong>{eth2} ETH ( ~${usd2} )</strong> (because the
                      transaction, if successful, will use ~195,000 gas of the 290,000 set as gas limit)</p>

                  </Col>
                </Row>
                <Row>
                  <Col md={12}>
                    {
                      as.err
                        ? <p style={{paddingTop: 12}}><BigAlert
                          title={as.err}
                          message={as.errMessage}
                        /></p>
                        : ''
                    }
                    <p><LoadingButton
                      text={as.err ? 'Try again' : 'Set it now!'}
                      loadingText="Starting transaction"
                      loading={as.loading}
                      cmd={() => {
                        this.startTransaction(as)
                      }}
                    /></p>
                  </Col>
                </Row>
              </div>
              :
              this.state.upgradabilityMessage
                ? <Row>
                  <Col md={12}>
                    <p><BigAlert
                      bsStyle="warning"
                      message={`The tweedentity is not upgradable because ${this.state.upgradabilityMessage}`}
                    /></p>
                    <p>
                      <Button
                        onClick={() => {
                          this.historyPush('welcome')
                        }}
                      >Go back to the dashboard</Button>
                    </p>
                  </Col>
                </Row>
                : <Row>
                  <Col md={12}>
                    <p><BigAlert
                      bsStyle="warning"
                      title="Whoops"
                      message="The tweedentity looks not upgradable"
                      link={this.investigateNotUpgradability}
                      linkMessage="Find why"
                      link2={() => {
                        this.historyPush('welcome')
                      }}
                      link2Message="Go back to the dashboard"
                    /></p>
                  </Col>
                </Row>
          }

        </Grid>
      )
    } else {

      let transaction = <a
        href={'https://' + (as.netId === '3' ? 'ropsten.' : '') + 'etherscan.io/tx/' + state.txHash}
        target="_blank">transaction</a>

      return (
        <Grid>
          <Row>
            <Col md={12}>
              <h4 style={{padding: '0 15px 8px'}}>Verification started
              </h4>
              <p><span className="mr12">
          <LoadingBadge
            text="1"
            loading={false}
          />
          </span>
                The transaction has been requested.</p>
              <p><span className="mr12">
          <LoadingBadge
            text="2"
            loading={state.step < 2 && !as.err}
          />
          </span>
                {
                  state.step === 2
                    ? <span>The {transaction} has been successfully confirmed.</span>
                    : state.step === 1
                    ? <span>The {transaction} has been included in a block. Waiting for confirmations.</span>
                    : <span>Waiting for the transaction to be included in a block.</span>

                }
              </p>
              {
                state.step > 1
                  ? <p><span className="mr12">
                      <LoadingBadge
                        text="3"
                        loading={state.step < 3 && !as.err}
                      />
                      </span>
                    {
                      state.step === 3
                        ? <span>The oracle has confirmed the ownership.</span>
                        : <span>Waiting for the oracle which is verifying the ownership.</span>
                    }</p>
                  : null
              }
              {
                state.step === 3
                  ?
                  <span>
                    <p>
                      <span className="mr12">
                        <Badge>4</Badge>
                        </span>
                      <span>Done!</span>
                    </p>
                    <p>
                      <Button style={{marginTop: 6}} bsStyle="success"
                              onClick={() => {
                                this.goHome()
                              }}
                      >Go back to the dashboard</Button>
                    </p>
                  </span>
                  : ''
              }
              {
                as.err
                  ?
                  <BigAlert
                    title={as.err}
                    message={as.errMessage}
                    link={() => {
                      this.setGlobalState({}, {err: null})
                      this.setGlobalState({
                        started: false,
                        step: 0
                      })
                      this.historyPush('signed')
                    }}
                    linkMessage="Go back"
                  />
                  : as.warn
                  ? <Alert bsStyle="warning">{as.warn}</Alert>
                  : ''
              }
            </Col>
          </Row>
        </Grid>
      )
    }

  }
}

export default Set
