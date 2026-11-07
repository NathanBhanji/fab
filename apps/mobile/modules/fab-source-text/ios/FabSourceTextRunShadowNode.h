#pragma once

#include <react/renderer/components/FabSourceTextSpec/EventEmitters.h>
#include <react/renderer/components/FabSourceTextSpec/Props.h>
#include <react/renderer/components/FabSourceTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char FabSourceTextRunComponentName[];

using FabSourceTextRunShadowNode =
    ConcreteViewShadowNode<FabSourceTextRunComponentName, FabSourceTextRunProps,
                           FabSourceTextRunEventEmitter, FabSourceTextRunState>;
} // namespace facebook::react
