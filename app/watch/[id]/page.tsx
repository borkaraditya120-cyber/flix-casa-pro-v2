import WatchClient from "../../../src/app/watch/[id]/watch-client";

export default WatchClient;

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "0" }];
}
