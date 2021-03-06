import Basic from './Basic'
import LoadingButton from './extras/LoadingButton'

const {Panel} = ReactBootstrap

class Account extends Basic {


  constructor(props) {
    super(props)

    this.execCommand = this.execCommand.bind(this)
  }


  execCommand(key) {
    if (key === 2) {
      this.historyPush('profile')
    }
  }

  render() {

    const as = this.appState()
    const data = this.props.data

    let content = <p>Coming soon...</p>

    if (this.props.active) {

      if (data.userId) {

        const idData = <p style={{paddingTop: 8}}>
          <span className="code">{this.appName()} ID: {data.userId}<br/>
          TID: {this.appId(this.props.webApp)}/{this.appUid(data, this.props.webApp)} </span>
        </p>

        content = <span>
            <p>
              <img style={{borderRadius: 100}} src={data.avatar} width="120" height="120"/>
            </p>
            <p className="user-data">
              {data.name}<br/>
              <a href={as.config.profileOnApp[this.props.webApp](data.username)}
                 target="_blank">{as.config.decoration[this.props.webApp]}{data.username}</a>
            </p>
          {idData}
          </span>
      } else if (this.props.profile) {
        content = <span>
          <p>
              <i style={{fontSize:120, color: '#d5eaf2'}} className="fas fa-user-circle"></i>
            </p>
        <p className="user-data">
        Tweedentity not set, yet
        </p>
      </span>
      } else {
        content = <span>
          <p>{
            <i style={{fontSize:120, color: '#d5eaf2'}} className="fas fa-user-circle"></i>
          }

            </p>
        <p className="user-data">
        Ready to claim your tweedentity?
        </p>
        <p>
          <LoadingButton
            text="Yes, please"
            loadingText="Analyzing wallet"
            loading={as.loading && this.loading}
            disabled={as.ready === 0 || (as.loading && !this.loading)}
            cmd={() => {
              this.loading = true
              this.props.getStats()
            }}
          />
        </p>
      </span>
      }
    }
    return (
      <Panel>
        <Panel.Body>
          <div className="account">
            <i className={`fab fa-${this.props.icon} appIcon`}></i>
            {as.ready === 1 && this.props.active && data.userId && !this.props.noSettings
              ? <i className="fa fa-cog settingsIcon command" onClick={() => {
                this.setGlobalState({appNickname: this.props.webApp})
                this.historyPush('manage-account')
              }}></i>
              : null}
            {content}
          </div>
        </Panel.Body>
      </Panel>
    )

  }
}

export default Account
