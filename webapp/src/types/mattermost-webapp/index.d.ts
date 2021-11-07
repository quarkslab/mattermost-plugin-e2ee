// From https://github.com/mickmister/mattermost-plugin-stonks/blob/33c7a5eaeb455aabe55d2e95daa620633cd195a3/webapp/src/registry.ts
import React from 'react';

import {Post} from 'mattermost-redux/types/posts';
import {FileInfo} from 'mattermost-redux/types/files';
import {Channel} from 'mattermost-redux/types/channels';

export type UniqueIdentifier = string;
export type ContextArgs = {channel_id: string};

export interface PluginRegistry {

    // Register a component at the root of the channel view of the app.
    // Accepts a React component. Returns a unique identifier.
    registerRootComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component in the user attributes section of the profile popover (hovercard), below the default user attributes.
    // Accepts a React component. Returns a unique identifier.
    registerPopoverUserAttributesComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component in the user actions of the profile popover (hovercard), below the default actions.
    // Accepts a React component. Returns a unique identifier.
    registerPopoverUserActionsComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component fixed to the top of the left-hand channel sidebar.
    // Accepts a React component. Returns a unique identifier.
    registerLeftSidebarHeaderComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component fixed to the bottom of the team sidebar. Does not render if
    // user is only on one team and the team sidebar is not shown.
    // Accepts a React component. Returns a unique identifier.
    registerBottomTeamSidebarComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component fixed to the bottom of the post message.
    // Accepts a React component. Returns a unique identifier.
    registerPostMessageAttachmentComponent(component: React.ElementType): UniqueIdentifier;

    // Register a component to show as a tooltip when a user hovers on a link in a post.
    // Accepts a React component. Returns a unique identifier.
    registerLinkTooltipComponent(component: React.ElementType): UniqueIdentifier;

    // Add a button to the channel header. If there are more than one buttons registered by any
    // plugin, a dropdown menu is created to contain all the plugin buttons.
    // Accepts the following:
    // - icon - React element to use as the button's icon
    // - action - a function called when the button is clicked, passed the channel and channel member as arguments
    // - dropdown_text - string or React element shown for the dropdown button description
    // - tooltip_text - string shown for tooltip appear on hover
    registerChannelHeaderButtonAction(
        icon: React.ReactNode,
        action: (channel: Channel) => void,
        dropdownText: React.ReactNode,
        tooltipText: string
    ): UniqueIdentifier;

    // Register a component to render a custom body for posts with a specific type.
    // Custom post types must be prefixed with 'custom_'.
    // Custom post types can also apply for ephemeral posts.
    // Accepts a string type and a component.
    // Returns a unique identifier.
    registerPostTypeComponent(type: string, component: React.ElementType): UniqueIdentifier;

    // Register a component to render a custom body for post cards with a specific type.
    // Custom post types must be prefixed with 'custom_'.
    // Accepts a string type and a component.
    // Returns a unique identifier.
    registerPostCardTypeComponent(type: string, component: React.ElementType): UniqueIdentifier;

    // Register a component to render a custom embed preview for post links.
    // Accepts the following:
    // - match - A function that receives the embed object and returns a
    //   boolean indicating if the plugin is able to process it.
    //   The embed object contains the embed `type`, the `url` of the post link
    //   and in some cases, a `data` object with information related to the
    //   link (the opengraph or the image details, for example).
    // - component - The component that renders the embed view for the link
    // - toggleable - A boolean indicating if the embed view should be collapsable
    // Returns a unique identifier.
    registerPostWillRenderEmbedComponent(
        match: (embed: {type: string, url: string, data?: {}}) => string,
        component: React.ElementType,
        toggleable: boolean
    ): UniqueIdentifier;

    // Register a main menu list item by providing some text and an action function.
    // Accepts the following:
    // - text - A string or React element to display in the menu
    // - action - A function to trigger when component is clicked on
    // - mobileIcon - A React element to display as the icon in the menu in mobile view
    // Returns a unique identifier.
    registerMainMenuAction(
        text: React.ReactNode,
        action: () => void,
        mobileIcon: React.ReactNode
    ): UniqueIdentifier;

    // Register a post menu list item by providing some text and an action function.
    // Accepts the following:
    // - text - A string or React element to display in the menu
    // - action - A function to trigger when component is clicked on
    // - filter - A function whether to apply the plugin into the post' dropdown menu
    // Returns a unique identifier.
    registerPostDropdownMenuAction(
        text: React.ReactNode,
        action: () => void,
        filter: (post: Post) => boolean
    ): UniqueIdentifier;

    // Register a post sub menu list item by providing some text and an action function.
    // Accepts the following:
    // - text - A string or React element to display in the menu
    // - action - A function to trigger when component is clicked on
    // - filter - A function whether to apply the plugin into the post' dropdown menu
    //
    // Returns an unique identifier for the root submenu, and a function to register submenu items.
    // At this time, only one level of nesting is allowed to avoid rendering issue in the RHS.
    registerPostDropdownSubMenuAction(
        text: React.ReactNode,
        action: () => void,
        filter: (post: Post) => boolean,
    ): {
        id: UniqueIdentifier,
        rootRegisterMenuItem: (
            text: React.ReactNode,
            action: () => void,
            filter: (post: Post) => boolean,
        ) => void;
    };

    // Register a component at the bottom of the post dropdown menu.
    // Accepts a React component. Returns a unique identifier.
    registerPostDropdownMenuComponent(component: React.ElementType): UniqueIdentifier;

    // Register a file upload method by providing some text, an icon, and an action function.
    // Accepts the following:
    // - icon - JSX element to use as the button's icon
    // - action - A function to trigger when the menu item is selected.
    // - text - A string or JSX element to display in the file upload menu
    // Returns a unique identifier.
    registerFileUploadMethod(
        icon: React.ReactNode,
        action: () => void,
        text: React.ReactNode
    ): string;

    // Register a hook to intercept file uploads before they take place.
    // Accepts a function to run before files get uploaded. Receives an array of
    // files and a function to upload files at a later time as arguments. Must
    // return an object that can contain two properties:
    // - message - An error message to display, leave blank or null to display no message
    // - files - Modified array of files to upload, set to null to reject all files
    // Returns a unique identifier.
    registerFilesWillUploadHook(hook: (
        inFiles: File[],
        upload: (files: FileInfo) => void
    ) => {
        message: string | null,
        files: FileInfo[],
    }): UniqueIdentifier;

    // Unregister a component, action or hook using the unique identifier returned after registration.
    // Accepts a string id.
    // Returns undefined in all cases.
    unregisterComponent(componentId: UniqueIdentifier): void;

    // Unregister a component that provided a custom body for posts with a specific type.
    // Accepts a string id.
    // Returns undefined in all cases.
    unregisterPostTypeComponent(componentId: UniqueIdentifier): void;

    // Register a reducer against the Redux store. It will be accessible in redux state
    // under "state['plugins-<yourpluginid>']"
    // Accepts a reducer. Returns undefined.
    registerReducer(reducer: {}): string;

    // Register a handler for WebSocket events.
    // Accepts the following:
    // - event - the event type, can be a regular server event or an event from plugins.
    // Plugin events will have "custom_<pluginid>_" prepended
    // - handler - a function to handle the event, receives the event message as an argument
    // Returns undefined.
    registerWebSocketEventHandler(
        eventType: string,
        handler: (event: {}) => void
    ): void;

    // Unregister a handler for a custom WebSocket event.
    // Accepts a string event type.
    // Returns undefined.
    unregisterWebSocketEventHandler(eventType: string): void;

    // Register a handler that will be called when the app reconnects to the
    // internet after previously disconnecting.
    // Accepts a function to handle the event. Returns undefined.
    registerReconnectHandler(handler: () => void): void;

    // Unregister a previously registered reconnect handler.
    // Returns undefined.
    unregisterReconnectHandler(): void;

    // Register a hook that will be called when a message is posted by the user before it
    // is sent to the server. Accepts a function that receives the post as an argument.
    //
    // To reject a post, return an object containing an error such as
    //     {error: {message: 'Rejected'}}
    // To modify or allow the post without modifcation, return an object containing the post
    // such as
    //     {post: {...}}
    //
    // If the hook function is asynchronous, the message will not be sent to the server
    // until the hook returns.
    registerMessageWillBePostedHook(
        hook: (post: Post) => (
            {post: Post} | {error: {message: string}} |
            Promise<{post: Post} | {error: {message: string}}>
        )
    ): UniqueIdentifier;

    /**
    * Register a hook that will be called when a message is edited by the user before it
    * is sent to the server. Accepts a function that receives the post as an argument.
    *
    * To reject a post, return an object containing an error such as
    *     {error: {message: 'Rejected'}}
    * To modify or allow the post without modification, return an object containing the post
    * such as
    *     {post: {...}}
    *
    * If the hook function is asynchronous, the message will not be sent to the server
    * until the hook returns.
    */
    registerMessageWillBeUpdatedHook(
        hook: (post: Post) => (
            {post: Post} | {error: {message: string}} |
            Promise<{post: Post} | {error: {message: string}}>
        )
    ): UniqueIdentifier;

    // Register a hook that will be called when a slash command is posted by the user before it
    // is sent to the server. Accepts a function that receives the message (string) and the args
    // (object) as arguments.
    // The args object is:
    //        {
    //            channel_id: channelId,
    //            team_id: teamId,
    //            root_id: rootId,
    //            parent_id: rootId,
    //        }
    //
    // To reject a command, return an object containing an error:
    //     {error: {message: 'Rejected'}}
    // To ignore a command, return an empty object (to prevent an error from being displayed):
    //     {}
    // To modify or allow the command without modification, return an object containing the new message
    // and args. It is not likely that you will need to change the args, so return the object that was provided:
    //     {message: {...}, args}
    //
    // If the hook function is asynchronous, the command will not be sent to the server
    // until the hook returns.

    registerSlashCommandWillBePostedHook(
        hook: (message: string, args: ContextArgs) => (
            {message: string, args: ContextArgs} | {} |
            Promise<{message: string, args: ContextArgs} | {}>
        )
    ): UniqueIdentifier;

    // Register a hook that will be called before a message is formatted into Markdown.
    // Accepts a function that receives the unmodified post and the message (potentially
    // already modified by other hooks) as arguments. This function must return a string
    // message that will be formatted.
    // Returns a unique identifier.
    registerMessageWillFormatHook(
        hook: (post: Post, message: string) => string
    ): UniqueIdentifier;

    // Register a component to override file previews. Accepts a function to run before file is
    // previewed and a react component to be rendered as the file preview.
    // - override - A function to check whether preview needs to be overridden. Receives fileInfo and post as arguments.
    // Returns true is preview should be overridden and false otherwise.
    // - component - A react component to display instead of original preview. Receives fileInfo and post as props.
    // Returns a unique identifier.
    // Only one plugin can override a file preview at a time. If two plugins try to override the same file preview, the first plugin will perform the override and the second will not. Plugin precedence is ordered alphabetically by plugin ID.
    registerFilePreviewComponent(
        override: (fileInfos: FileInfo[], post: Post) => boolean,
        component: React.ElementType
    ): UniqueIdentifier

    registerTranslations(getTranslationsForLocale: (locale: string) => {[translationID: string]: string}): void;

    // Register a admin console definitions override function
    // Note that this is a low-level interface primarily meant for internal use, and is not subject
    // to semver guarantees. It may change in the future.
    // Accepts the following:
    // - func - A function that receives the admin console config definitions and return a new
    //          version of it, which is used for build the admin console.
    // Each plugin can register at most one admin console plugin function, with newer registrations
    // replacing older ones.
    registerAdminConsolePlugin(func: (config: {}) => void): void;

    // Unregister a previously registered admin console definition override function.
    // Returns undefined.
    unregisterAdminConsolePlugin(): void;

    // Register a custom React component to manage the plugin configuration for the given setting key.
    // Accepts the following:
    // - key - A key specified in the settings_schema.settings block of the plugin's manifest.
    // - component - A react component to render in place of the default handling.
    // - options - Object for the following available options to display the setting:
    //     showTitle - Optional boolean that if true the display_name of the setting will be rendered
    // on the left column of the settings page and the registered component will be displayed on the
    // available space in the right column.
    registerAdminConsoleCustomSetting(
        key: string,
        component: React.ElementType,
        options: {showTitle?: boolean}
    ): void;

    // Register a Right-Hand Sidebar component by providing a title for the right hand component.
    // Accepts the following:
    // - component - A react component to display in the Right-Hand Sidebar.
    // - title - A string or JSX element to display as a title for the RHS.
    // Returns:
    // - id: a unique identifier
    // - showRHSPlugin: the action to dispatch that will open the RHS.
    // - hideRHSPlugin: the action to dispatch that will close the RHS
    // - toggleRHSPlugin: the action to dispatch that will toggle the RHS
    registerRightHandSidebarComponent(
        component: React.ElementType,
        title: React.ReactNode
    ): {
        id: UniqueIdentifier,
        showRHSPlugin: {},
        hideRHSPlugin: {},
        toggleRHSPlugin: {}
    };

    // Register a Needs Team component by providing a route past /:team/:pluginId/ to be displayed at.
    // Accepts the following:
    // - route - The route to be displayed at.
    // - component - A react component to display.
    // Returns:
    // - id: a unique identifier
    registerNeedsTeamRoute(route: string, component: React.ElementType): UniqueIdentifier;

    // Register a component to be displayed at a custom route under /plug/:pluginId
    // Accepts the following:
    // - route - The route to be displayed at.
    // - component - A react component to display.
    // Returns:
    // - id: a unique identifier
    registerCustomRoute(route: string, component: React.ElementType): UniqueIdentifier;
}
