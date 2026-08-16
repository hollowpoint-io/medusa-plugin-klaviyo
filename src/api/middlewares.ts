import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { PostKlaviyoSubscribeSchema } from "./store/klaviyo/subscribe/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/klaviyo/subscribe",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostKlaviyoSubscribeSchema)],
    },
  ],
})
