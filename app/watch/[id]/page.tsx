import WatchClient from "@/app/watch/[id]/watch-client";

export async function generateStaticParams() {
	return [{ id: "1" }];
}

export const dynamicParams = false;

export default WatchClient;
