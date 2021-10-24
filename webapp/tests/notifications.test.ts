import 'mattermost-webapp/tests/setup';
import {UserProfile} from 'mattermost-redux/types/users';

import {shouldNotify} from '../src/notifications';

test('mentions', () => {
    const profile: UserProfile = {};
    profile.notify_props = {};

    profile.notify_props.channel = 'true';
    profile.notify_props.desktop = 'all';
    profile.notify_props.push_status = 'online';
    profile.notify_props.first_name = 'false';
    profile.notify_props.mention_keys = '';

    profile.username = 'roger';
    expect(shouldNotify('test @roger test', profile)).toStrictEqual(true);
    expect(shouldNotify('test @roger @henri-the-best test', profile)).toStrictEqual(true);
    expect(shouldNotify('test roger', profile)).toStrictEqual(false);
    expect(shouldNotify('test @roger@henri', profile)).toStrictEqual(false);
    expect(shouldNotify('test @roger @henri', profile)).toStrictEqual(true);
    expect(shouldNotify('@roger', profile)).toStrictEqual(true);
    expect(shouldNotify('@all', profile)).toStrictEqual(true);
    expect(shouldNotify('@channel', profile)).toStrictEqual(true);

    profile.username = 'henri';
    expect(shouldNotify('test @roger @henri-the-best test', profile)).toStrictEqual(false);
    expect(shouldNotify('test @roger@henri', profile)).toStrictEqual(false);
    expect(shouldNotify('test @roger @henri', profile)).toStrictEqual(true);

    profile.username = 'Roger';
    expect(shouldNotify('test @roger test', profile)).toStrictEqual(false);
    expect(shouldNotify('test @roger @henri-the-best test', profile)).toStrictEqual(false);

    profile.username = 'henri-the-best';
    expect(shouldNotify('test @roger @henri-the-best test', profile)).toStrictEqual(true);

    profile.username = 'test.with.point';
    expect(shouldNotify('@test.with.point', profile)).toStrictEqual(true);

    profile.notify_props.first_name = 'true';
    profile.first_name = 'Henri';
    expect(shouldNotify('hello henri', profile)).toStrictEqual(false);
    expect(shouldNotify('hello Henri', profile)).toStrictEqual(true);
    expect(shouldNotify('Henri', profile)).toStrictEqual(true);

    profile.notify_props.mention_keys = 'chocolate';
    expect(shouldNotify('hello henri do you want some Chocolate', profile)).toStrictEqual(true);
});
