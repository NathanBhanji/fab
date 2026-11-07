// The production icon, as GitHub shows the Fab app, whatever this build's channel.
import appIconUrl from "../../../../assets/prod/fab-black-web-apple-touch-180.png";

export function FabAppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
