import BigAlert from './extras/BigAlert'
import Basic from './Basic'
import LoadingApp from './LoadingApp'

const {Grid, Row, Col} = ReactBootstrap


class Unconnected extends Basic {

  render() {

    let welcomeMessage = ''

    const as = this.appState()


    if (as.connectionChecked) {

      if (as.connected !== -1) {

        const netId = as.netId

        if (netId == null) {

          welcomeMessage = <BigAlert
            title="Web3js not found"
            message="You must either install MetaMask or use a browser compatible with Ethereum like Mist, Parity or Brave. On mobile, you could use TrustWallet."
            link="https://metamask.io"
            linkMessage="Get MetaMask"
          />

        } else if (netId === '0') {

          welcomeMessage =
            <BigAlert
              title="Unsupported network."
              message="Please connect to the Main Ethereum Network."
            />

        } else if (!as.wallet) {
          welcomeMessage =
            <BigAlert
              title="Wallet not found."
              message="Please, activate your wallet and refresh the page."
            />
        }
      }
      return (
        <Grid>
          <Row>
            <Col md={12}>
              {welcomeMessage}
            </Col>
          </Row>
        </Grid>
      )
    } else {

      return <LoadingApp
        app={this.props.app}
        message="Preparing the app..."
      />

    }

  }
}

export default Unconnected
